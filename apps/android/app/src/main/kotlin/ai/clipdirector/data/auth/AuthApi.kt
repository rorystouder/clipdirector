package ai.clipdirector.data.auth

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.Header
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
 * The unauthenticated OkHttpClient serves this interface so the refresh call
 * cannot recursively trigger AuthAuthenticator. Logout is here too — it needs
 * the bearer, but we pass it explicitly as a header so it survives expiry
 * (an expired access token at logout-time still wants to revoke the refresh).
 */
interface AuthApi {

    @POST("auth/register")
    suspend fun register(@Body body: AuthCredentials): AuthSuccess

    @POST("auth/login")
    suspend fun login(@Body body: AuthCredentials): AuthSuccess

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): RefreshResponse

    @POST("auth/logout")
    suspend fun logout(
        @Header("Authorization") bearer: String,
        @Body body: LogoutRequest,
    )
}
