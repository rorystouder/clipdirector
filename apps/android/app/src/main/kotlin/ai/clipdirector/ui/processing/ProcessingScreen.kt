package ai.clipdirector.ui.processing

import ai.clipdirector.appContainer
import ai.clipdirector.data.job.JobStatus
import ai.clipdirector.ui.components.StatusPill
import ai.clipdirector.ui.theme.statusColor
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory

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
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        when (val s = state) {
            ProcessingViewModel.State.Connecting -> {
                BigProgressDial(progress = null, label = "Connecting…")
            }
            is ProcessingViewModel.State.Polling -> {
                BigProgressDial(
                    progress = s.response.progress / 100f,
                    label = "${s.response.progress}%",
                    accentColor = statusColor(s.response.status),
                )
                Spacer(Modifier.height(16.dp))
                StatusPill(s.response.status)
                Spacer(Modifier.height(8.dp))
                Text(
                    descriptionFor(s.response.status),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            is ProcessingViewModel.State.Complete -> {
                BigProgressDial(
                    progress = 1f,
                    label = "Done",
                    accentColor = statusColor(JobStatus.COMPLETE),
                )
                Spacer(Modifier.height(16.dp))
                Text("Ready to preview", style = MaterialTheme.typography.titleMedium)
            }
            is ProcessingViewModel.State.Failed -> {
                BigProgressDial(
                    progress = 1f,
                    label = "Failed",
                    accentColor = statusColor(JobStatus.FAILED),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    s.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = onRetry,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                ) {
                    Text("Back to prompt", style = MaterialTheme.typography.labelLarge)
                }
            }
        }

        Spacer(Modifier.height(32.dp))
        Text(
            "Job $jobId",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        )
    }
}

@Composable
private fun BigProgressDial(
    progress: Float?,
    label: String,
    accentColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary,
) {
    Box(
        modifier = Modifier.size(180.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (progress == null) {
            CircularProgressIndicator(
                modifier = Modifier.fillMaxSize(),
                color = accentColor,
                strokeWidth = 6.dp,
                trackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            )
        } else {
            CircularProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxSize(),
                color = accentColor,
                strokeWidth = 6.dp,
                trackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            )
        }
        Text(
            label,
            style = MaterialTheme.typography.displayMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun descriptionFor(status: JobStatus): String = when (status) {
    JobStatus.QUEUED -> "Waiting for an open worker."
    JobStatus.SAMPLING -> "Pulling representative frames from your clips."
    JobStatus.REASONING -> "Claude is composing the edit manifest."
    JobStatus.RENDERING -> "FFmpeg is cutting + assembling your video."
    JobStatus.UPLOADING -> "Pushing the rendered MP4 to storage."
    JobStatus.COMPLETE -> "Ready."
    JobStatus.FAILED -> "Something went wrong."
}
