package ai.clipdirector.data.network

import ai.clipdirector.BuildConfig
import ai.clipdirector.data.auth.AccountApi
import ai.clipdirector.data.auth.AuthApi
import ai.clipdirector.data.auth.AuthAuthenticator
import ai.clipdirector.data.auth.AuthInterceptor
import ai.clipdirector.data.auth.TokenStore
import ai.clipdirector.data.job.JobApi
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Hand-rolled DI for the network stack. Built once per process by
 * [ai.clipdirector.AppContainer]. Two OkHttpClients live here:
 *
 * - [unauthedClient] — no AuthInterceptor / Authenticator. Used by [authApi]
 *   so the refresh call itself never tries to recursively refresh.
 * - [authedClient] — AuthInterceptor adds Bearer, AuthAuthenticator handles
 *   401-refresh-retry. Used by [accountApi] and [jobApi].
 */
class NetworkModule(tokenStore: TokenStore) {

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private val converterFactory = json.asConverterFactory("application/json".toMediaType())

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
        else HttpLoggingInterceptor.Level.NONE
    }

    private val unauthedClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.MINUTES) // multipart uploads
        .build()

    private val unauthedRetrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(unauthedClient)
        .addConverterFactory(converterFactory)
        .build()

    val authApi: AuthApi = unauthedRetrofit.create(AuthApi::class.java)

    private val authedClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(tokenStore))
        .addInterceptor(loggingInterceptor)
        .authenticator(AuthAuthenticator(tokenStore) { authApi })
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.MINUTES)
        .build()

    private val authedRetrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(authedClient)
        .addConverterFactory(converterFactory)
        .build()

    val accountApi: AccountApi = authedRetrofit.create(AccountApi::class.java)
    val jobApi: JobApi = authedRetrofit.create(JobApi::class.java)
}
