package ai.clipdirector.ui.auth

import ai.clipdirector.data.auth.AuthRepository
import ai.clipdirector.data.auth.AuthResult
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class RegisterViewModel(private val authRepo: AuthRepository) : ViewModel() {

    sealed interface State {
        data object Idle : State
        data object Submitting : State
        data class Error(val message: String) : State
        data object Success : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    fun register(email: String, password: String, confirmPassword: String) {
        if (_state.value is State.Submitting) return
        if (password != confirmPassword) {
            _state.value = State.Error("Passwords do not match")
            return
        }
        if (password.length < MIN_PASSWORD_LEN) {
            _state.value = State.Error("Password must be at least $MIN_PASSWORD_LEN characters")
            return
        }
        if (!EMAIL_REGEX.matches(email.trim())) {
            _state.value = State.Error("Enter a valid email address")
            return
        }
        _state.value = State.Submitting
        viewModelScope.launch {
            when (val result = authRepo.register(email, password)) {
                is AuthResult.Success -> _state.value = State.Success
                is AuthResult.Failure -> _state.value = State.Error(result.message)
            }
        }
    }

    fun acknowledgeError() {
        if (_state.value is State.Error) _state.value = State.Idle
    }

    companion object {
        // Matches gateway constraint (packages/shared-types env: password >= 12).
        const val MIN_PASSWORD_LEN = 12
        private val EMAIL_REGEX = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
    }
}
