package ai.clipdirector

import ai.clipdirector.data.auth.AuthRepository
import ai.clipdirector.data.auth.TokenStore
import ai.clipdirector.data.error.ApiErrorAdapter
import ai.clipdirector.data.job.JobIdStore
import ai.clipdirector.data.job.JobRepository
import ai.clipdirector.data.network.NetworkModule
import android.content.Context

/**
 * Hand-rolled service locator. Constructed lazily in [ClipDirectorApp.onCreate]
 * and held for the process lifetime. UI layer reads it via
 * [Context.appContainer]. No DI framework — five screens + two repositories
 * doesn't earn Hilt's annotation-processor + KSP build cost.
 */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val tokenStore: TokenStore = TokenStore(appContext)
    val jobIdStore: JobIdStore = JobIdStore(appContext)

    private val errorAdapter = ApiErrorAdapter()
    private val network = NetworkModule(tokenStore)

    val authRepository: AuthRepository = AuthRepository(
        authApi = network.authApi,
        accountApi = network.accountApi,
        tokenStore = tokenStore,
        errorAdapter = errorAdapter,
    )

    val jobRepository: JobRepository = JobRepository(
        jobApi = network.jobApi,
        jobIdStore = jobIdStore,
        errorAdapter = errorAdapter,
        contentResolver = appContext.contentResolver,
    )
}

val Context.appContainer: AppContainer
    get() = (applicationContext as ClipDirectorApp).container
