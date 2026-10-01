package com.chandrabindu.home.ui.sleek

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The hub's own artwork: `/background/sleek.jpg` (falling back to `/background.jpg`,
 * like the web's layered CSS) and `/logo.png`. Downloaded once per hub address and
 * cached on disk, so the backdrop shows instantly and while away from home.
 */
object HubImages {
    private val http = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    @Volatile private var memo = HashMap<String, ImageBitmap>()

    private fun cacheFile(context: Context, base: String, name: String): File {
        val dir = File(context.cacheDir, "hub-images").apply { mkdirs() }
        return File(dir, "${base.hashCode().toUInt()}-$name")
    }

    private fun download(base: String, path: String, to: File): Boolean = try {
        http.newCall(Request.Builder().url(base + path).build()).execute().use { r ->
            val type = r.header("Content-Type") ?: ""
            if (!r.isSuccessful || !type.startsWith("image/")) return false
            val tmp = File(to.path + ".part")
            tmp.outputStream().use { out -> r.body.byteStream().copyTo(out) }
            tmp.renameTo(to)
        }
    } catch (_: Exception) {
        false
    }

    /** Small, pre-blurred backdrop bitmap (the blur is the look, so we never need full resolution). */
    suspend fun background(context: Context, base: String, refresh: Boolean): ImageBitmap? = withContext(Dispatchers.IO) {
        val key = "bg:$base"
        if (!refresh) memo[key]?.let { return@withContext it }
        val file = cacheFile(context, base, "background")
        if (refresh || !file.exists()) {
            if (!download(base, "/background/sleek.jpg", file)) download(base, "/background.jpg", file)
        }
        if (!file.exists()) return@withContext null
        decodeSmall(file, 360)?.let { blur(it, 6) }?.asImageBitmap()?.also { memo = HashMap(memo).apply { put(key, it) } }
    }

    suspend fun logo(context: Context, base: String, refresh: Boolean): ImageBitmap? = withContext(Dispatchers.IO) {
        val key = "logo:$base"
        if (!refresh) memo[key]?.let { return@withContext it }
        val file = cacheFile(context, base, "logo")
        if (refresh || !file.exists()) download(base, "/logo.png", file)
        if (!file.exists()) return@withContext null
        decodeSmall(file, 192)?.asImageBitmap()?.also { memo = HashMap(memo).apply { put(key, it) } }
    }

    private fun decodeSmall(file: File, targetWidth: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        if (bounds.outWidth <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= targetWidth) sample *= 2
        val bmp = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        if (bmp.width <= targetWidth) return bmp
        val h = (bmp.height * targetWidth.toFloat() / bmp.width).roundToInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bmp, targetWidth, h, true)
    }

    /** Three box-blur passes (close to a gaussian) on a small bitmap. */
    private fun blur(src: Bitmap, radius: Int): Bitmap {
        val w = src.width
        val h = src.height
        val px = IntArray(w * h)
        src.getPixels(px, 0, w, 0, 0, w, h)
        val tmp = IntArray(w * h)
        repeat(3) {
            boxPass(px, tmp, w, h, radius, horizontal = true)
            boxPass(tmp, px, w, h, radius, horizontal = false)
        }
        return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }

    private fun boxPass(input: IntArray, output: IntArray, w: Int, h: Int, r: Int, horizontal: Boolean) {
        val lines = if (horizontal) h else w
        val len = if (horizontal) w else h
        val div = 2 * r + 1
        for (line in 0 until lines) {
            var rs = 0
            var gs = 0
            var bs = 0
            fun idx(i: Int): Int {
                val c = i.coerceIn(0, len - 1)
                return if (horizontal) line * w + c else c * w + line
            }
            for (i in -r..r) {
                val p = input[idx(i)]
                rs += (p shr 16) and 0xFF; gs += (p shr 8) and 0xFF; bs += p and 0xFF
            }
            for (i in 0 until len) {
                output[idx(i)] = (0xFF shl 24) or ((rs / div) shl 16) or ((gs / div) shl 8) or (bs / div)
                val add = input[idx(i + r + 1)]
                val rem = input[idx(i - r)]
                rs += ((add shr 16) and 0xFF) - ((rem shr 16) and 0xFF)
                gs += ((add shr 8) and 0xFF) - ((rem shr 8) and 0xFF)
                bs += (add and 0xFF) - (rem and 0xFF)
            }
        }
    }
}

private val saturate = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(1.15f) })

/**
 * Full-screen backdrop, mirroring `body::before` / `body::after` in globals.css:
 * the blurred photo under a brand tint, then a frost veil (light) or a dark veil.
 */
@Composable
fun SleekBackdrop(base: String, dark: Boolean, context: Context, refreshKey: Any? = null) {
    var image by remember(base) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(base) { image = HubImages.background(context, base, refresh = false) }
    LaunchedEffect(base, refreshKey) {
        if (refreshKey != null) HubImages.background(context, base, refresh = true)?.let { image = it }
    }
    Box(Modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(Color(0xFFDFE3EC)) // body background-color fallback
            image?.let { img ->
                // background-size: cover, scaled 1.12 like the CSS transform.
                val scale = max(size.width / img.width, size.height / img.height) * 1.12f
                val dw = img.width * scale
                val dh = img.height * scale
                drawImage(
                    img,
                    dstOffset = IntOffset(((size.width - dw) / 2).roundToInt(), ((size.height - dh) / 2).roundToInt()),
                    dstSize = IntSize(dw.roundToInt(), dh.roundToInt()),
                    filterQuality = FilterQuality.High,
                    colorFilter = saturate,
                )
            }
            // linear-gradient(135deg, rgba(99,102,241,.25), rgba(56,189,248,.2))
            drawRect(
                Brush.linearGradient(
                    listOf(Color(0x406366F1), Color(0x3338BDF8)),
                    start = Offset.Zero, end = Offset(size.width, size.height),
                ),
            )
            // Frost veil (light) or the dark theme's veil.
            drawRect(
                if (dark) Brush.verticalGradient(listOf(Color(0x9E080A10), Color(0xBD080A10)))
                else Brush.verticalGradient(listOf(Color(0x6BFFFFFF), Color(0x4DFFFFFF))),
            )
        }
    }
}

@Composable
fun rememberLogo(base: String, context: Context): ImageBitmap? {
    var logo by remember(base) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(base) {
        logo = HubImages.logo(context, base, refresh = false)
    }
    return logo
}
