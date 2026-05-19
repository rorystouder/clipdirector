package ai.clipdirector.ui.prompt

import ai.clipdirector.data.job.CaptionStyle
import ai.clipdirector.data.job.JobRepository
import ai.clipdirector.data.job.MusicMood
import ai.clipdirector.data.job.Platform
import ai.clipdirector.data.job.SubmissionDraft
import ai.clipdirector.data.job.UploadStage
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PromptViewModel(
    private val jobRepository: JobRepository,
    private val submissionDraft: SubmissionDraft,
) : ViewModel() {

    data class FormState(
        val prompt: String = "",
        val platform: Platform = Platform.TIKTOK,
        val musicMood: MusicMood = MusicMood.NONE,
        val captionStyle: CaptionStyle = CaptionStyle.NONE,
    )

    sealed interface SubmitState {
        data object Idle : SubmitState
        data object Preparing : SubmitState
        data class Uploading(val fraction: Float) : SubmitState
        data class Submitted(val jobId: String) : SubmitState
        data class Error(val message: String) : SubmitState
    }

    private val _form = MutableStateFlow(FormState())
    val form: StateFlow<FormState> = _form.asStateFlow()

    private val _submitState = MutableStateFlow<SubmitState>(SubmitState.Idle)
    val submitState: StateFlow<SubmitState> = _submitState.asStateFlow()

    val clipCount: Int get() = submissionDraft.clips.value.size

    fun updatePrompt(text: String) { _form.value = _form.value.copy(prompt = text) }
    fun updatePlatform(p: Platform) { _form.value = _form.value.copy(platform = p) }
    fun updateMood(m: MusicMood) { _form.value = _form.value.copy(musicMood = m) }
    fun updateStyle(s: CaptionStyle) { _form.value = _form.value.copy(captionStyle = s) }

    fun submit() {
        val clips = submissionDraft.clips.value
        if (clips.isEmpty()) {
            _submitState.value = SubmitState.Error("No clips selected")
            return
        }
        val f = _form.value
        if (f.prompt.isBlank()) {
            _submitState.value = SubmitState.Error("Enter a prompt")
            return
        }
        if (f.prompt.length > MAX_PROMPT_LEN) {
            _submitState.value = SubmitState.Error("Prompt over $MAX_PROMPT_LEN characters")
            return
        }
        _submitState.value = SubmitState.Preparing
        viewModelScope.launch {
            jobRepository.submitJob(
                clipUris = clips,
                userPrompt = f.prompt,
                platform = f.platform,
                musicMood = f.musicMood,
                captionStyle = f.captionStyle,
            ).collect { stage ->
                _submitState.value = when (stage) {
                    UploadStage.Preparing -> SubmitState.Preparing
                    is UploadStage.Uploading -> SubmitState.Uploading(stage.fraction)
                    is UploadStage.Submitted -> SubmitState.Submitted(stage.jobId).also {
                        submissionDraft.clear()
                    }
                    is UploadStage.Failure -> SubmitState.Error(stage.message)
                }
            }
        }
    }

    fun acknowledgeError() {
        if (_submitState.value is SubmitState.Error) _submitState.value = SubmitState.Idle
    }

    companion object {
        // Matches gateway MAX_PROMPT_LENGTH default.
        const val MAX_PROMPT_LEN = 500
    }
}
