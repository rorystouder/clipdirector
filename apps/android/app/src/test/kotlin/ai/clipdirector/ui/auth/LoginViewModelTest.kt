package ai.clipdirector.ui.auth

import ai.clipdirector.MainDispatcherRule
import ai.clipdirector.data.auth.AuthRepository
import ai.clipdirector.data.auth.AuthResult
import ai.clipdirector.data.auth.AuthUser
import app.cash.turbine.test
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    @get:Rule
    val mainDispatcher = MainDispatcherRule()

    @Test
    fun `successful login transitions to Success state`() = runTest {
        val repo: AuthRepository = mockk()
        coEvery { repo.login(any(), any()) } returns AuthResult.Success(AuthUser("u1", "a@b.com"))
        val vm = LoginViewModel(repo)

        vm.state.test {
            assertTrue(awaitItem() is LoginViewModel.State.Idle)
            vm.login("a@b.com", "correcthorsebatterystaple")
            assertTrue(awaitItem() is LoginViewModel.State.Submitting)
            assertTrue(awaitItem() is LoginViewModel.State.Success)
        }
    }

    @Test
    fun `failed login transitions to Error and acknowledgeError returns to Idle`() = runTest {
        val repo: AuthRepository = mockk()
        coEvery { repo.login(any(), any()) } returns AuthResult.Failure("Invalid credentials")
        val vm = LoginViewModel(repo)

        vm.login("a@b.com", "x".repeat(12))
        advanceUntilIdle()
        val error = vm.state.value as LoginViewModel.State.Error
        assertEquals("Invalid credentials", error.message)

        vm.acknowledgeError()
        assertTrue(vm.state.value is LoginViewModel.State.Idle)
    }

    @Test
    fun `double-tap login does not fire two repository calls`() = runTest {
        val repo: AuthRepository = mockk()
        coEvery { repo.login(any(), any()) } returns AuthResult.Success(AuthUser("u1", "a@b.com"))
        val vm = LoginViewModel(repo)

        vm.login("a@b.com", "correcthorsebatterystaple")
        // second call BEFORE the first finishes — should be ignored
        vm.login("a@b.com", "correcthorsebatterystaple")
        advanceUntilIdle()

        coVerify(exactly = 1) { repo.login(any(), any()) }
    }
}
