package ai.clipdirector.data.job

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

@Serializable
enum class JobStatus {
    @SerialName("queued") QUEUED,
    @SerialName("sampling") SAMPLING,
    @SerialName("reasoning") REASONING,
    @SerialName("rendering") RENDERING,
    @SerialName("uploading") UPLOADING,
    @SerialName("complete") COMPLETE,
    @SerialName("failed") FAILED;

    val isTerminal: Boolean get() = this == COMPLETE || this == FAILED
}

@Serializable
data class SubmitJobResponse(
    val jobId: String,
    val status: JobStatus,
)

@Serializable
data class JobStatusResponse(
    val jobId: String,
    val userId: String,
    val status: JobStatus,
    val progress: Int,
    val outputUrl: String? = null,
    val errorMessage: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class DownloadUrlResponse(
    val url: String,
    val expiresAt: String,
)

@Serializable
enum class Platform {
    @SerialName("tiktok") TIKTOK,
    @SerialName("reels") REELS,
    @SerialName("shorts") SHORTS,
    @SerialName("generic") GENERIC,
}

@Serializable
enum class MusicMood {
    @SerialName("energetic") ENERGETIC,
    @SerialName("chill") CHILL,
    @SerialName("nostalgic") NOSTALGIC,
    @SerialName("cinematic") CINEMATIC,
    @SerialName("none") NONE,
}

@Serializable
enum class CaptionStyle {
    @SerialName("bold_white_shadow") BOLD_WHITE_SHADOW,
    @SerialName("minimal") MINIMAL,
    @SerialName("none") NONE,
}

@Serializable
data class SubmitJobPayload(
    val userPrompt: String,
    val platform: Platform,
    val musicMood: MusicMood,
    val captionStyle: CaptionStyle,
)

interface JobApi {

    @Multipart
    @POST("jobs")
    suspend fun submitJob(
        @Part clips: List<MultipartBody.Part>,
        @Part("json") body: RequestBody,
    ): SubmitJobResponse

    @GET("jobs/{jobId}")
    suspend fun getJobStatus(
        @Path("jobId") jobId: String,
    ): JobStatusResponse

    @GET("jobs/{jobId}/download")
    suspend fun getDownloadUrl(
        @Path("jobId") jobId: String,
    ): DownloadUrlResponse
}
