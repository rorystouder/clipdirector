package ai.clipdirector.ui.preview

import ai.clipdirector.data.error.ApiErrorAdapter
import ai.clipdirector.data.job.JobRepository
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PreviewViewModel(
    private val jobRepository: JobRepository,
    private val errorAdapter: ApiErrorAdapter,
) : ViewModel() {

    sealed interface State {
        data object Loading : State
        data class Ready(val url: String) : State
        data class Error(val message: String) : State
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state.asStateFlow()

    fun load(jobId: String) {
        _state.value = State.Loading
        viewModelScope.launch {
            runCatching { jobRepository.getDownloadUrl(jobId) }
                .onSuccess { _state.value = State.Ready(it.url) }
                .onFailure { _state.value = State.Error(errorAdapter.userMessage(it)) }
        }
    }
}
