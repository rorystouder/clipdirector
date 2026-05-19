package ai.clipdirector.ui.history

import ai.clipdirector.appContainer
import ai.clipdirector.data.job.JobStatus
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer

@Composable
fun HistoryScreen(onOpenComplete: (jobId: String) -> Unit) {
    val container = LocalContext.current.appContainer
    val vm: HistoryViewModel = viewModel(
        factory = viewModelFactory {
            initializer { HistoryViewModel(container.jobIdStore, container.jobRepository) }
        }
    )
    val entries by vm.entries.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("History", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))

        if (entries.isEmpty()) {
            Text(
                "No jobs yet. Submit one from the home screen.",
                style = MaterialTheme.typography.bodyMedium,
            )
            return@Column
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(entries, key = { it.jobId }) { entry ->
                HistoryRow(entry, onClick = {
                    if (entry.status?.status == JobStatus.COMPLETE) onOpenComplete(entry.jobId)
                })
            }
        }
    }
}

@Composable
private fun HistoryRow(entry: HistoryEntry, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(entry.jobId.take(8) + "…", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            val statusText = when {
                entry.error != null -> "error: ${entry.error}"
                entry.status == null -> "loading…"
                else -> "${entry.status.status.name.lowercase()} · ${entry.status.progress}%"
            }
            Text(statusText, style = MaterialTheme.typography.bodySmall)
        }
    }
}
