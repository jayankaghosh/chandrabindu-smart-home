package com.chandrabindu.home.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small Android Keystore-backed encryption for the session token and the cookie
 * jar. The AES key never leaves the Keystore; SharedPreferences only ever holds
 * IV + ciphertext.
 */
class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences("secure", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun put(name: String, plain: String?) {
        if (plain == null) {
            prefs.edit().remove(name).apply()
            return
        }
        try {
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val packed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            prefs.edit().putString(name, Base64.encodeToString(packed, Base64.NO_WRAP)).apply()
        } catch (_: Exception) {
            prefs.edit().remove(name).apply()
        }
    }

    fun get(name: String): String? {
        val stored = prefs.getString(name, null) ?: return null
        return try {
            val packed = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, packed, 0, 12))
            String(cipher.doFinal(packed, 12, packed.size - 12), Charsets.UTF_8)
        } catch (_: Exception) {
            null // key lost (e.g. restored to a new phone): treat as signed out
        }
    }

    private companion object {
        const val ALIAS = "chandrabindu_session"
        const val TRANSFORM = "AES/GCM/NoPadding"
    }
}

data class StoredSession(val token: String, val username: String, val role: String, val server: String) {
    val isAdmin: Boolean get() = role == "admin"

    fun toJson(): String = JSONObject()
        .put("token", token).put("username", username).put("role", role).put("server", server)
        .toString()

    companion object {
        fun fromJson(s: String?): StoredSession? = try {
            s?.let {
                val o = JSONObject(it)
                StoredSession(o.getString("token"), o.getString("username"), o.getString("role"), o.getString("server"))
            }
        } catch (_: Exception) {
            null
        }
    }
}

/**
 * OkHttp cookie jar persisted (encrypted) across launches. Room unlocks are
 * recorded by the hub in the `shc_unlocks` cookie, which later commands must carry.
 */
class PersistentCookieJar(private val store: SecureStore) : CookieJar {
    private val cookies = mutableListOf<Cookie>()

    init {
        try {
            val arr = JSONArray(store.get("cookies") ?: "[]")
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val url = HttpUrl.Builder().scheme(if (o.optBoolean("secure")) "https" else "http")
                    .host(o.getString("domain")).build()
                Cookie.parse(url, o.getString("header"))?.let { cookies += it }
            }
        } catch (_: Exception) {
        }
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        for (c in cookies) {
            this.cookies.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }
            if (c.expiresAt > System.currentTimeMillis() && c.value.isNotEmpty()) this.cookies += c
        }
        persist()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        if (cookies.removeAll { it.expiresAt <= now }) persist()
        return cookies.filter { it.matches(url) }
    }

    @Synchronized
    fun clear() {
        cookies.clear()
        persist()
    }

    private fun persist() {
        val arr = JSONArray()
        for (c in cookies) {
            if (!c.persistent) continue
            arr.put(JSONObject().put("domain", c.domain).put("secure", c.secure).put("header", c.toString()))
        }
        store.put("cookies", arr.toString())
    }
}

/** Plain (non-secret) preferences. */
class Prefs(context: Context) {
    private val p = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    var server: String
        get() = p.getString("server", null) ?: DEFAULT_SERVER
        set(v) = p.edit().putString("server", v).apply()

    /** Quick Settings tile slot (0..2) -> "deviceId::code", or null for "automatic". */
    fun tileBinding(slot: Int): String? = p.getString("tile$slot", null)
    fun setTileBinding(slot: Int, key: String?) {
        p.edit().apply { if (key == null) remove("tile$slot") else putString("tile$slot", key) }.apply()
    }

    /** Last /api/rooms and /api/favourites bodies (names only, no secrets), for instant cold starts. */
    var cachedRooms: String?
        get() = p.getString("cache_rooms", null)
        set(v) = p.edit().putString("cache_rooms", v).apply()
    var cachedFavourites: String?
        get() = p.getString("cache_favs", null)
        set(v) = p.edit().putString("cache_favs", v).apply()

    fun clearCache() = p.edit().remove("cache_rooms").remove("cache_favs").apply()

    companion object {
        const val DEFAULT_SERVER = "http://192.168.68.68"
    }
}
