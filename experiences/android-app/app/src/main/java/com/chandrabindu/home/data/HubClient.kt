package com.chandrabindu.home.data

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

sealed class HubException(message: String) : Exception(message) {
    class Unreachable : HubException("Can't reach your home hub.")
    class Unauthorized : HubException("Your session has expired. Please sign in again.")
    class Server(val code: Int, message: String) : HubException(message)
    class BadResponse : HubException("Unexpected response from the hub.")
}

enum class Reachability { OK, UNREACHABLE, NOT_HUB }

/**
 * Talks to the hub's REST API with the Bearer token native clients get from
 * /api/auth/login. Cookies stay on (persisted jar) because a room unlock is
 * recorded in the `shc_unlocks` cookie, which later commands must carry.
 */
class HubClient(base: String, val cookieJar: PersistentCookieJar) {
    @Volatile var base: String = normalize(base)
        private set
    @Volatile var token: String? = null

    private val http = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val pingClient = http.newBuilder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .callTimeout(4, TimeUnit.SECONDS)
        .build()

    // The event stream idles between messages; the gateway pings every 20s.
    private val streamClient = http.newBuilder()
        .readTimeout(90, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()

    val host: String get() = base.toHttpUrlOrNull()?.host ?: base

    fun setBase(raw: String) {
        base = normalize(raw)
    }

    private fun request(path: String, method: String, body: JSONObject?): Request {
        val b = Request.Builder().url(base + path).header("Accept", "application/json")
        token?.let { b.header("Authorization", "Bearer $it") }
        val rb = body?.toString()?.toRequestBody(JSON)
        when (method) {
            "GET" -> b.get()
            else -> b.method(method, rb ?: "{}".toRequestBody(JSON))
        }
        return b.build()
    }

    suspend fun send(
        path: String,
        method: String = "POST",
        body: JSONObject? = null,
        timeoutSec: Long = 25,
    ): JSONObject {
        val client = if (timeoutSec == 25L) http else http.newBuilder().readTimeout(timeoutSec, TimeUnit.SECONDS).build()
        val req = try {
            request(path, method, body)
        } catch (_: IllegalArgumentException) {
            throw HubException.Unreachable() // malformed address
        }
        val r = try {
            client.newCall(req).awaitText()
        } catch (e: IOException) {
            throw HubException.Unreachable()
        }
        run {
            val text = r.text
            if (r.code == 401) throw HubException.Unauthorized()
            if (r.code !in 200..299) {
                val message = try {
                    JSONObject(text).optString("error").takeIf { it.isNotEmpty() }
                } catch (_: Exception) {
                    null
                }
                throw HubException.Server(r.code, message ?: "Request failed (${r.code})")
            }
            if (text.isBlank()) return JSONObject()
            return try {
                JSONObject(text)
            } catch (_: Exception) {
                throw HubException.BadResponse()
            }
        }
    }

    suspend fun get(path: String, timeoutSec: Long = 25) = send(path, "GET", null, timeoutSec)

    /** Is the hub there, and is it really our hub (not some other box at that IP)? */
    suspend fun ping(): Reachability {
        val req = try {
            Request.Builder().url("$base/api/metadata").build()
        } catch (_: IllegalArgumentException) {
            return Reachability.UNREACHABLE
        }
        return try {
            pingClient.newCall(req).awaitText().let { r ->
                if (r.code != 200) return Reachability.NOT_HUB
                val name = try {
                    JSONObject(r.text).optString("name")
                } catch (_: Exception) {
                    ""
                }
                if (name == EXPECTED_NAME) Reachability.OK else Reachability.NOT_HUB
            }
        } catch (_: IOException) {
            Reachability.UNREACHABLE
        }
    }

    interface StreamHandler {
        fun onOpen()
        fun onEvent(name: String, data: String)
        /** code: 204 = hub has no live stream; 401 = session gone; else dropped. */
        fun onClosed(code: Int?)
    }

    /** Opens /api/events. The gateway writes `event: <name>` then a one-line `data: <json>`. */
    fun openEvents(handler: StreamHandler): EventSource {
        val req = request("/api/events", "GET", null).newBuilder()
            .header("Accept", "text/event-stream")
            .build()
        return EventSources.createFactory(streamClient).newEventSource(req, object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) = handler.onOpen()

            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) =
                handler.onEvent(type ?: "message", data)

            override fun onClosed(eventSource: EventSource) = handler.onClosed(null)

            override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                handler.onClosed(response?.code)
            }
        })
    }

    companion object {
        const val EXPECTED_NAME = "Chandrabindu Smart Home"
        private val JSON = "application/json".toMediaType()

        fun normalize(raw: String): String {
            var s = raw.trim()
            if (!s.lowercase().startsWith("http://") && !s.lowercase().startsWith("https://")) s = "http://$s"
            while (s.endsWith("/")) s = s.dropLast(1)
            return s
        }
    }
}

class TextResponse(val code: Int, val text: String)

/**
 * Cancellable suspend wrapper for an OkHttp call. The body is read on OkHttp's
 * own thread, so callers on the main thread never touch the socket.
 */
suspend fun Call.awaitText(): TextResponse = suspendCancellableCoroutine { cont ->
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            val result = try {
                response.use { TextResponse(it.code, it.body.string()) }
            } catch (e: IOException) {
                if (cont.isActive) cont.resumeWithException(e)
                return
            }
            if (cont.isActive) cont.resume(result)
        }

        override fun onFailure(call: Call, e: IOException) {
            if (cont.isActive) cont.resumeWithException(e)
        }
    })
    cont.invokeOnCancellation { runCatching { cancel() } }
}
