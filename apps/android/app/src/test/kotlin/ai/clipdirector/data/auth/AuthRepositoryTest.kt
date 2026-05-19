@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package ai.clipdirector.data.auth

import ai.clipdirector.data.error.ApiErrorAdapter
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit

class AuthRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var authApi: AuthApi
    private val tokenStore: TokenStore = mockk(relaxed = true)
    private val accountApi: AccountApi = mockk(relaxed = true)

    @Before
    fun setUp() {
        server = MockWebServer().also { it.start() }
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
        authApi = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(AuthApi::class.java)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `successful login saves tokens and returns user`() = runTest {
        val tokensSlot = MutableStateFlow<Tokens?>(null)
        coEvery { tokenStore.save(any()) } answers {
            tokensSlot.value = firstArg()
        }
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"user":{"id":"u1","email":"a@b.com"},"accessToken":"AT","refreshToken":"RT","expiresInSec":900}"""
            )
        )
        val repo = AuthRepository(authApi, accountApi, tokenStore, ApiErrorAdapter())

        val result = repo.login("A@B.com", "correcthorsebatterystaple")

        assertTrue(result is AuthResult.Success)
        assertEquals("a@b.com", (result as AuthResult.Success).user.email)
        val saved = tokensSlot.value
        assertNotNull("tokens should be saved on success", saved)
        assertEquals("AT", saved!!.accessToken)
        assertEquals("RT", saved.refreshToken)
        // gateway lowercases — ensure we sent lowercase too.
        // Read the body ONCE — okio.Buffer drains on read.
        val recorded = server.takeRequest()
        val body = recorded.body.readUtf8()
        assertTrue(
            "request body should contain lowercased email, got $body",
            body.contains("\"a@b.com\""),
        )
    }

    @Test
    fun `401 login produces Failure not Success`() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(401).setBody(
                """{"code":"unauthorized","message":"Invalid credentials"}"""
            )
        )
        val repo = AuthRepository(authApi, accountApi, tokenStore, ApiErrorAdapter())

        val result = repo.login("a@b.com", "wrongpassword123")

        assertTrue("expected Failure, got $result", result is AuthResult.Failure)
        coVerify(exactly = 0) { tokenStore.save(any()) }
    }

    @Test
    fun `429 rate limit surfaces Retry-After header`() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(429)
                .addHeader("Retry-After", "120")
                .setBody("""{"code":"rate_limited","message":"too many"}""")
        )
        val repo = AuthRepository(authApi, accountApi, tokenStore, ApiErrorAdapter())

        val result = repo.login("a@b.com", "correcthorsebatterystaple")

        val failure = result as AuthResult.Failure
        assertTrue("message should mention 120 seconds: ${failure.message}", failure.message.contains("120"))
    }

    @Test
    fun `register 409 is reported as conflict with server message`() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(409).setBody(
                """{"code":"conflict","message":"Email already registered"}"""
            )
        )
        val repo = AuthRepository(authApi, accountApi, tokenStore, ApiErrorAdapter())

        val result = repo.register("a@b.com", "correcthorsebatterystaple")

        val failure = result as AuthResult.Failure
        assertEquals("Email already registered", failure.message)
    }

    @Test
    fun `logout clears tokens even if server call fails`() = runTest {
        coEvery { tokenStore.current() } returns Tokens("AT", "RT", "a@b.com")
        coEvery { accountApi.logout(any()) } throws RuntimeException("network")

        val repo = AuthRepository(authApi, accountApi, tokenStore, ApiErrorAdapter())
        repo.logout()

        coVerify { tokenStore.clear() }
    }
}
