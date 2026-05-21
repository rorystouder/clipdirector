package ai.clipdirector.data.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds `Authorization: Bearer <accessToken>` to every outgoing request on the
 * authed OkHttpClient. Reads the current token synchronously via
 * [runBlocking]; DataStore reads are cheap after first hydration.
 *
 * For requests with no stored token, sends unauthorized — the server returns
 * 401 and the UI redirects to login.
 *
 * `AuthApi.logout` lives on the *unauthed* client and passes its bearer via
 * an explicit `@Header` parameter, so this interceptor never needs to
 * special-case any request URL.
 */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val tokens = runBlocking { tokenStore.current() }
        val bearer = tokens?.accessToken ?: return chain.proceed(request)
        val authed = request.newBuilder()
            .header("Authorization", "Bearer $bearer")
            .build()
        return chain.proceed(authed)
    }
}
