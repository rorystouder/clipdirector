package ai.clipdirector.data.network

import kotlinx.coroutines.flow.MutableSharedFlow
import okhttp3.MediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.Sink
import okio.buffer

/**
 * Wraps a [RequestBody] to emit upload progress (0.0 → 1.0) to a
 * [MutableSharedFlow]. Emissions are throttled to every [EMIT_THRESHOLD_BYTES]
 * so a 50 MB upload doesn't trigger thousands of recompositions.
 */
class CountingRequestBody(
    private val delegate: RequestBody,
    private val onProgress: (bytesWritten: Long, contentLength: Long) -> Unit,
) : RequestBody() {

    override fun contentType(): MediaType? = delegate.contentType()
    override fun contentLength(): Long = delegate.contentLength()

    override fun writeTo(sink: BufferedSink) {
        val countingSink = CountingSink(sink, contentLength(), onProgress).buffer()
        delegate.writeTo(countingSink)
        countingSink.flush()
    }

    private class CountingSink(
        delegate: Sink,
        private val totalBytes: Long,
        private val onProgress: (Long, Long) -> Unit,
    ) : ForwardingSink(delegate) {
        private var bytesWritten = 0L
        private var lastEmitBytes = 0L

        override fun write(source: Buffer, byteCount: Long) {
            super.write(source, byteCount)
            bytesWritten += byteCount
            if (bytesWritten - lastEmitBytes >= EMIT_THRESHOLD_BYTES || bytesWritten == totalBytes) {
                onProgress(bytesWritten, totalBytes)
                lastEmitBytes = bytesWritten
            }
        }
    }

    companion object {
        const val EMIT_THRESHOLD_BYTES = 64L * 1024L
    }
}
