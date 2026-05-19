package ai.clipdirector.data.auth

import ai.clipdirector.data.error.ApiErrorAdapter
import kotlinx.coroutines.flow.Flow
import retrofit2.HttpException

sealed interface AuthResult {
    data class Success(val user: AuthUser) : AuthResult
    data class Failure(val message: String) : AuthResult
}

/**
 * Coordinates [AuthApi] + [TokenStore]. Returns user-friendly [AuthResult]s
 * rather than leaking HTTP exceptions to the UI.
 */
class AuthRepository(
    private val authApi: AuthApi,
    private val accountApi: AccountApi,
    private val tokenStore: TokenStore,
    private val errorAdapter: ApiErrorAdapter,
) {

    val tokens: Flow<Tokens?> = tokenStore.tokens

    suspend fun register(email: String, password: String): AuthResult {
        return try {
            val success = authApi.register(AuthCredentials(email.trim().lowercase(), password))
            tokenStore.save(
                Tokens(
                    accessToken = success.accessToken,
                    refreshToken = success.refreshToken,
                    email = success.user.email,
                )
            )
            AuthResult.Success(success.user)
        } catch (e: HttpException) {
            AuthResult.Failure(errorAdapter.userMessage(e))
        } catch (e: Exception) {
            AuthResult.Failure(errorAdapter.userMessage(e))
        }
    }

    suspend fun login(email: String, password: String): AuthResult {
        return try {
            val success = authApi.login(AuthCredentials(email.trim().lowercase(), password))
            tokenStore.save(
                Tokens(
                    accessToken = success.accessToken,
                    refreshToken = success.refreshToken,
                    email = success.user.email,
                )
            )
            AuthResult.Success(success.user)
        } catch (e: HttpException) {
            AuthResult.Failure(errorAdapter.userMessage(e))
        } catch (e: Exception) {
            AuthResult.Failure(errorAdapter.userMessage(e))
        }
    }

    suspend fun logout(): AuthResult {
        val current = tokenStore.current()
        if (current != null) {
            runCatching { accountApi.logout(LogoutRequest(current.refreshToken)) }
        }
        tokenStore.clear()
        return AuthResult.Success(AuthUser(id = "", email = current?.email ?: ""))
    }
}
