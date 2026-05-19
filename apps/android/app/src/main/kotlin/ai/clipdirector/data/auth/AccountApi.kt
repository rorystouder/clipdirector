package ai.clipdirector.data.auth

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

@Serializable
data class MeResponse(val user: AuthUser)

/**
 * AUTHENTICATED endpoints under /auth (logout, me). Served by the main OkHttpClient
 * (interceptor + authenticator). Distinguished from [AuthApi] which is
 * served by the un-authed client.
 */
interface AccountApi {

    @POST("auth/logout")
    suspend fun logout(@Body body: LogoutRequest)

    @GET("auth/me")
    suspend fun me(): MeResponse
}
