package ai.clipdirector.data.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds `Authorization: Bearer <accessToken>` to every outgoing request,
 * UNLESS the request was tagged [SkipAuth] (used for /auth/refresh and
 * other public endpoints that must not present a stale token).
 *
 * Uses [runBlocking] to read the current token synchronously. The DataStore
 * read is cheap (in-memory after first hydration). For requests with no
 * stored token, sends the request unauthorized — the server returns 401
 * and the UI redirects to login.
 */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {

    object SkipAuth

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.tag(SkipAuth::class.java) != null) {
            return chain.proceed(request)
        }
        val tokens = runBlocking { tokenStore.current() }
        val bearer = tokens?.accessToken ?: return chain.proceed(request)
        val authed = request.newBuilder()
            .header("Authorization", "Bearer $bearer")
            .build()
        return chain.proceed(authed)
    }
}
