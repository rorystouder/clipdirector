package ai.clipdirector.data.auth

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

@Serializable
data class AuthUser(val id: String, val email: String)

@Serializable
data class AuthCredentials(val email: String, val password: String)

@Serializable
data class AuthSuccess(
    val user: AuthUser,
    val accessToken: String,
    val refreshToken: String,
    val expiresInSec: Long,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class RefreshResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresInSec: Long,
)

@Serializable
data class LogoutRequest(val refreshToken: String)

/**
 * UNAUTHENTICATED endpoints. The OkHttpClient used to build this interface
 * MUST NOT carry the [AuthInterceptor] / [AuthAuthenticator] — otherwise
 * refresh-on-401 calls itself and we get an infinite loop.
 */
interface AuthApi {

    @POST("auth/register")
    suspend fun register(@Body body: AuthCredentials): AuthSuccess

    @POST("auth/login")
    suspend fun login(@Body body: AuthCredentials): AuthSuccess

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): RefreshResponse
}
