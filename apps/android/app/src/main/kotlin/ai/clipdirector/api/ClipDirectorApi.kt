package ai.clipdirector.api

import kotlinx.serialization.Serializable
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

// Wire format aligns with PRD Section 6.2.
// Real Retrofit instantiation, auth interceptor, and base URL are Phase 2.

@Serializable
data class SubmitJobResponse(
    val jobId: String,
    val status: String,
)

@Serializable
data class JobStatusResponse(
    val jobId: String,
    val userId: String,
    val status: String,
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

interface ClipDirectorApi {

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
