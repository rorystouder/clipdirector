package ai.clipdirector.ui.clips

import ai.clipdirector.appContainer
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.decode.VideoFrameDecoder

@Composable
fun ClipSelectScreen(onNext: () -> Unit) {
    val context = LocalContext.current
    val container = context.appContainer
    val vm: ClipSelectViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                ClipSelectViewModel(context.contentResolver, container.submissionDraft)
            }
        }
    )
    val clips by vm.clips.collectAsStateWithLifecycle()
    val totalMs by vm.totalDurationMs.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()

    // PickVisualMedia (backported to API 19+ by AndroidX, falls back to SAF
    // on devices without PhotoPicker support). One-shot multi-pick up to 12.
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(ClipSelectViewModel.MAX_CLIPS)
    ) { uris: List<Uri> -> vm.setSelection(uris) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Select clips", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(4.dp))
        Text(
            "${clips.size} of ${ClipSelectViewModel.MAX_CLIPS} selected · " +
                "total ${totalMs / 1000}s",
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = {
                launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
            }) { Text(if (clips.isEmpty()) "Pick videos" else "Replace selection") }

            if (clips.isNotEmpty()) {
                OutlinedButton(onClick = { vm.clear() }) { Text("Clear") }
            }
        }

        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }

        Spacer(Modifier.height(12.dp))

        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(clips, key = { it.uri.toString() }) { pick ->
                ClipThumbnail(pick, onRemove = { vm.remove(pick.uri) })
            }
        }

        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { vm.confirmAndProceed(onValid = onNext) },
            modifier = Modifier.fillMaxWidth(),
            enabled = clips.isNotEmpty(),
        ) { Text("Next") }
    }
}

@Composable
private fun ClipThumbnail(pick: ClipPick, onRemove: () -> Unit) {
    val context = LocalContext.current
    Card(modifier = Modifier.aspectRatio(1f)) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Coil with VideoFrameDecoder pulls a frame from the video for the thumb.
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(pick.uri)
                    .decoderFactory(VideoFrameDecoder.Factory())
                    .build(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
            )
            IconButton(
                onClick = onRemove,
                modifier = Modifier.align(Alignment.TopEnd),
            ) {
                Icon(Icons.Filled.Close, contentDescription = "Remove")
            }
            if (pick.durationMs > 0) {
                Text(
                    text = "${pick.durationMs / 1000}s",
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.align(Alignment.BottomStart).padding(4.dp),
                )
            }
        }
    }
}
