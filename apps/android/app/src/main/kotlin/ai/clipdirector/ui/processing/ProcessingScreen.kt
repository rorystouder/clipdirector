package ai.clipdirector.ui.processing

import ai.clipdirector.appContainer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer

@Composable
fun ProcessingScreen(
    jobId: String,
    onComplete: (jobId: String) -> Unit,
    onRetry: () -> Unit,
) {
    val container = LocalContext.current.appContainer
    val vm: ProcessingViewModel = viewModel(
        factory = viewModelFactory { initializer { ProcessingViewModel(container.jobRepository) } }
    )
    val state by vm.state.collectAsStateWithLifecycle()

    LaunchedEffect(jobId) { vm.watch(jobId) }

    LaunchedEffect(state) {
        val s = state
        if (s is ProcessingViewModel.State.Complete) onComplete(s.response.jobId)
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Processing your cut", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text("Job $jobId", style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(24.dp))

        when (val s = state) {
            ProcessingViewModel.State.Connecting -> {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Text("Connecting…")
            }
            is ProcessingViewModel.State.Polling -> {
                LinearProgressIndicator(
                    progress = { (s.response.progress / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text("${s.response.status.name.lowercase()} · ${s.response.progress}%")
            }
            is ProcessingViewModel.State.Complete -> {
                Text("Complete!", style = MaterialTheme.typography.titleMedium)
            }
            is ProcessingViewModel.State.Failed -> {
                Text(s.message, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(16.dp))
                Button(onClick = onRetry) { Text("Back to prompt") }
            }
        }
    }
}
