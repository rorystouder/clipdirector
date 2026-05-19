package ai.clipdirector.data.auth

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * Reactive auth refresh. OkHttp invokes [authenticate] when an outgoing
 * request comes back 401. We refresh under a [Mutex] so concurrent 401s
 * only fire one /auth/refresh — without this, five parallel job requests
 * after a token expiry would race and rotate the refresh token N times,
 * invalidating each other.
 *
 * Returning null aborts the retry (used when refresh itself fails or when
 * a request has already been retried once — no infinite loops).
 */
class AuthAuthenticator(
    private val tokenStore: TokenStore,
    private val authApiProvider: () -> AuthApi,
) : Authenticator {

    private val refreshMutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Only retry once — second 401 means refresh didn't help.
        if (responseCount(response) >= 2) return null

        val originalRequest = response.request
        val attemptedToken = originalRequest.header("Authorization")?.removePrefix("Bearer ")

        return runBlocking {
            refreshMutex.withLock {
                val current = tokenStore.current() ?: return@withLock null

                // Another concurrent 401 may have already refreshed while we were
                // waiting on the mutex. If our retry request would carry a DIFFERENT
                // access token than the one that just failed, just retry with that.
                if (current.accessToken != attemptedToken) {
                    return@withLock originalRequest.newBuilder()
                        .header("Authorization", "Bearer ${current.accessToken}")
                        .build()
                }

                // Stale or first refresh — call gateway.
                val refreshed = runCatching {
                    authApiProvider().refresh(RefreshRequest(current.refreshToken))
                }.getOrNull() ?: run {
                    // Refresh failed (401 from gateway = refresh token revoked/expired).
                    // Clear and abort retry; UI will redirect to login on next auth check.
                    tokenStore.clear()
                    return@withLock null
                }

                val newTokens = current.copy(
                    accessToken = refreshed.accessToken,
                    refreshToken = refreshed.refreshToken,
                )
                tokenStore.save(newTokens)

                originalRequest.newBuilder()
                    .header("Authorization", "Bearer ${newTokens.accessToken}")
                    .build()
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count += 1
            prior = prior.priorResponse
        }
        return count
    }
}
