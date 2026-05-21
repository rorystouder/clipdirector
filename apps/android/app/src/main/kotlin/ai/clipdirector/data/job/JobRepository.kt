package ai.clipdirector.data.job

import ai.clipdirector.data.error.ApiErrorAdapter
import ai.clipdirector.data.network.CountingRequestBody
import android.content.ContentResolver
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import retrofit2.HttpException
import java.io.IOException
import java.util.concurrent.atomic.AtomicLong

sealed interface UploadStage {
    data object Preparing : UploadStage
    data class Uploading(val fraction: Float) : UploadStage
    data class Submitted(val jobId: String) : UploadStage
    data class Failure(val message: String) : UploadStage
}

class JobRepository(
    private val jobApi: JobApi,
    private val jobIdStore: JobIdStore,
    private val errorAdapter: ApiErrorAdapter,
    private val contentResolver: ContentResolver,
    private val json: Json = Json { ignoreUnknownKeys = true; explicitNulls = false },
) {

    fun submitJob(
        clipUris: List<Uri>,
        userPrompt: String,
        platform: Platform,
        musicMood: MusicMood,
        captionStyle: CaptionStyle,
    ): Flow<UploadStage> = channelFlow {
        send(UploadStage.Preparing)

        val payload = SubmitJobPayload(userPrompt, platform, musicMood, captionStyle)
        val payloadJson = json.encodeToString(SubmitJobPayload.serializer(), payload)
        val jsonPart = payloadJson.toRequestBody("application/json".toMediaType())

        // Pre-compute total bytes across all clips for accurate progress.
        // Any unknown size (-1) falls back to 1 to avoid div-by-zero; progress
        // for that part will jump 0→100 rather than smooth-fill.
        val sizes = clipUris.map { (contentResolver.byteSize(it)).coerceAtLeast(0L) }
        val totalBytes = sizes.sum().coerceAtLeast(1)
        val previousBytesUploaded = AtomicLong(0L)

        val clipParts = clipUris.mapIndexed { index, uri ->
            val mime = contentResolver.getType(uri) ?: "video/mp4"
            val partSize = sizes[index]
            val raw = UriRequestBody(contentResolver, uri, mime, partSize)
            val counting = CountingRequestBody(raw) { bytesWrittenThisPart, partTotal ->
                val total = previousBytesUploaded.get() + bytesWrittenThisPart
                val fraction = (total.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
                this@channelFlow.trySend(UploadStage.Uploading(fraction))
                if (bytesWrittenThisPart == partTotal && partTotal > 0) {
                    previousBytesUploaded.addAndGet(partTotal)
                }
            }
            MultipartBody.Part.createFormData(
                name = "clips",
                filename = "clip_${index.toString().padStart(2, '0')}.mp4",
                body = counting,
            )
        }

        try {
            val response = jobApi.submitJob(clipParts, jsonPart)
            jobIdStore.add(response.jobId)
            send(UploadStage.Submitted(response.jobId))
        } catch (e: HttpException) {
            send(UploadStage.Failure(errorAdapter.userMessage(e)))
        } catch (e: IOException) {
            send(UploadStage.Failure(errorAdapter.userMessage(e)))
        }
    }.flowOn(Dispatchers.IO)

    suspend fun getJobStatus(jobId: String): JobStatusResponse = jobApi.getJobStatus(jobId)

    suspend fun getDownloadUrl(jobId: String): DownloadUrlResponse = jobApi.getDownloadUrl(jobId)

    private fun ContentResolver.byteSize(uri: Uri): Long {
        openAssetFileDescriptor(uri, "r")?.use { fd ->
            return fd.length.takeIf { it != -1L } ?: -1L
        }
        return -1L
    }

    private class UriRequestBody(
        private val resolver: ContentResolver,
        private val uri: Uri,
        private val mimeType: String,
        private val length: Long,
    ) : RequestBody() {
        override fun contentType() = mimeType.toMediaType()
        override fun contentLength(): Long = length
        override fun writeTo(sink: BufferedSink) {
            resolver.openInputStream(uri)?.source()?.use { src -> sink.writeAll(src) }
                ?: throw IOException("Could not open clip URI: $uri")
        }
    }
}
