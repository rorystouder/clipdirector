package ai.clipdirector.data.error

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException

@Serializable
data class GatewayError(
    val code: String,
    val message: String,
    val details: List<String>? = null,
)

/**
 * Translates exceptions thrown by Retrofit / OkHttp into user-facing
 * strings. Special-cases the gateway's `{ code, message, details? }`
 * envelope and rate-limit headers.
 */
class ApiErrorAdapter(private val json: Json = Json { ignoreUnknownKeys = true }) {

    fun userMessage(error: Throwable): String = when (error) {
        is HttpException -> mapHttpError(error)
        is IOException -> "Network error: ${error.message ?: "no connection"}"
        else -> "Unexpected error: ${error.message ?: error::class.simpleName}"
    }

    private fun mapHttpError(error: HttpException): String {
        val response = error.response()
        val errorBody = response?.errorBody()?.string()
        val parsed = errorBody?.let { runCatching { json.decodeFromString<GatewayError>(it) }.getOrNull() }

        // Special cases the gateway emits with predictable codes.
        return when {
            parsed != null && parsed.code == "rate_limited" -> {
                val retryAfter = response.headers()["Retry-After"]
                if (retryAfter != null) "Too many requests — try again in $retryAfter seconds"
                else "Too many requests — please slow down"
            }
            parsed != null && parsed.code == "conflict" -> parsed.message
            parsed != null && parsed.code == "validation_error" -> {
                val detail = parsed.details?.firstOrNull()
                if (detail != null) "${parsed.message}: $detail" else parsed.message
            }
            parsed != null -> parsed.message
            error.code() == 401 -> "Not signed in"
            error.code() == 403 -> "Not allowed"
            error.code() == 404 -> "Not found"
            error.code() in 500..599 -> "Server error (${error.code()}) — try again"
            else -> "Request failed: ${error.code()}"
        }
    }
}
