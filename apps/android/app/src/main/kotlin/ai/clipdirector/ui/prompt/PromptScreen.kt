package ai.clipdirector.ui.prompt

import ai.clipdirector.appContainer
import ai.clipdirector.data.job.CaptionStyle
import ai.clipdirector.data.job.MusicMood
import ai.clipdirector.data.job.Platform
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PromptScreen(onSubmit: (jobId: String) -> Unit) {
    val container = LocalContext.current.appContainer
    val vm: PromptViewModel = viewModel(
        factory = viewModelFactory {
            initializer { PromptViewModel(container.jobRepository, container.submissionDraft) }
        }
    )
    val form by vm.form.collectAsStateWithLifecycle()
    val state by vm.submitState.collectAsStateWithLifecycle()

    LaunchedEffect(state) {
        val s = state
        if (s is PromptViewModel.SubmitState.Submitted) onSubmit(s.jobId)
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Describe your cut", style = MaterialTheme.typography.headlineSmall)
        Text(
            "${vm.clipCount} clip${if (vm.clipCount == 1) "" else "s"} ready to upload",
            style = MaterialTheme.typography.bodySmall,
        )

        OutlinedTextField(
            value = form.prompt,
            onValueChange = { vm.updatePrompt(it); vm.acknowledgeError() },
            label = { Text("Prompt") },
            placeholder = { Text("e.g. snappy 6 second highlight cut") },
            supportingText = { Text("${form.prompt.length} / ${PromptViewModel.MAX_PROMPT_LEN}") },
            modifier = Modifier.fillMaxWidth(),
        )

        EnumDropdown("Platform", form.platform, Platform.values().toList()) { vm.updatePlatform(it) }
        EnumDropdown("Music mood", form.musicMood, MusicMood.values().toList()) { vm.updateMood(it) }
        EnumDropdown("Caption style", form.captionStyle, CaptionStyle.values().toList()) { vm.updateStyle(it) }

        when (val s = state) {
            is PromptViewModel.SubmitState.Error -> {
                Text(s.message, color = MaterialTheme.colorScheme.error)
            }
            is PromptViewModel.SubmitState.Uploading -> {
                LinearProgressIndicator(
                    progress = { s.fraction },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Uploading clips: ${(s.fraction * 100).toInt()}%")
            }
            PromptViewModel.SubmitState.Preparing -> { Text("Preparing upload…") }
            else -> Unit
        }

        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { vm.submit() },
            enabled = state is PromptViewModel.SubmitState.Idle ||
                state is PromptViewModel.SubmitState.Error,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state is PromptViewModel.SubmitState.Preparing ||
                state is PromptViewModel.SubmitState.Uploading
            ) {
                CircularProgressIndicator(modifier = Modifier.height(20.dp))
            } else {
                Text("Submit")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T : Enum<T>> EnumDropdown(
    label: String,
    selected: T,
    options: List<T>,
    onSelected: (T) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
    ) {
        OutlinedTextField(
            value = selected.name.lowercase(),
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { opt ->
                DropdownMenuItem(
                    text = { Text(opt.name.lowercase()) },
                    onClick = { onSelected(opt); expanded = false },
                )
            }
        }
    }
}
