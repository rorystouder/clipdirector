package ai.clipdirector.ui.auth

import ai.clipdirector.data.auth.AuthRepository
import ai.clipdirector.data.auth.AuthResult
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class LoginViewModel(private val authRepo: AuthRepository) : ViewModel() {

    sealed interface State {
        data object Idle : State
        data object Submitting : State
        data class Error(val message: String) : State
        data object Success : State
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    fun login(email: String, password: String) {
        if (_state.value is State.Submitting) return
        _state.value = State.Submitting
        viewModelScope.launch {
            when (val result = authRepo.login(email, password)) {
                is AuthResult.Success -> _state.value = State.Success
                is AuthResult.Failure -> _state.value = State.Error(result.message)
            }
        }
    }

    fun acknowledgeError() {
        if (_state.value is State.Error) _state.value = State.Idle
    }
}
