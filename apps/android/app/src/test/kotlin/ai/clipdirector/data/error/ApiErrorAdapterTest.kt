package ai.clipdirector.data.error

import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException

/**
 * Adversarial tests: every assertion is a regression I'd notice in
 * production. If a gateway-envelope field is silently dropped, these tests
 * fail loud.
 */
class ApiErrorAdapterTest {

    private val adapter = ApiErrorAdapter()

    @Test
    fun `validation error message is surfaced including first detail`() {
        val body = """{"code":"validation_error","message":"Invalid input","details":["email is required"]}"""
        val msg = adapter.userMessage(httpException(400, body))
        assertEquals("Invalid input: email is required", msg)
    }

    @Test
    fun `rate limited message includes Retry-After header value`() {
        val body = """{"code":"rate_limited","message":"slow down"}"""
        val msg = adapter.userMessage(httpException(429, body, headers = mapOf("Retry-After" to "60")))
        assertTrue("expected '60 seconds' in: $msg", msg.contains("60 seconds"))
    }

    @Test
    fun `rate limited without Retry-After falls back to generic copy`() {
        val body = """{"code":"rate_limited","message":"slow down"}"""
        val msg = adapter.userMessage(httpException(429, body))
        assertTrue("should not say 'null seconds': $msg", !msg.contains("null"))
        assertTrue("should mention slowing down: $msg", msg.contains("slow", ignoreCase = true))
    }

    @Test
    fun `unparseable body falls back to status-code message`() {
        val msg = adapter.userMessage(httpException(401, "this is not JSON"))
        assertEquals("Not signed in", msg)
    }

    @Test
    fun `IO errors do not mention HTTP status`() {
        val msg = adapter.userMessage(java.io.IOException("connection reset"))
        assertTrue("expected network-style message: $msg", msg.startsWith("Network error"))
    }

    @Test
    fun `unknown exception types still produce a non-empty user message`() {
        val msg = adapter.userMessage(RuntimeException("boom"))
        assertTrue("must be non-empty", msg.isNotBlank())
    }

    private fun httpException(
        code: Int,
        body: String,
        headers: Map<String, String> = emptyMap(),
    ): HttpException {
        val headersBuilder = Headers.Builder()
        headers.forEach { (k, v) -> headersBuilder.add(k, v) }
        val raw = Response.Builder()
            .request(Request.Builder().url("http://test").build())
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message("err")
            .headers(headersBuilder.build())
            .body(body.toResponseBody("application/json".toMediaType()))
            .build()
        val retrofitResponse = retrofit2.Response.error<Any>(
            body.toResponseBody("application/json".toMediaType()),
            raw,
        )
        return HttpException(retrofitResponse)
    }
}
