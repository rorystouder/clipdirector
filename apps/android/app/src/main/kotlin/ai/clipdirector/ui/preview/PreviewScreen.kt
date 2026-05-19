package ai.clipdirector.ui.preview

import ai.clipdirector.appContainer
import ai.clipdirector.data.error.ApiErrorAdapter
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.viewmodel.initializer
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

@Composable
fun PreviewScreen(
    jobId: String,
    onHome: () -> Unit,
) {
    val context = LocalContext.current
    val container = context.appContainer
    val vm: PreviewViewModel = viewModel(
        factory = viewModelFactory {
            initializer { PreviewViewModel(container.jobRepository, ApiErrorAdapter()) }
        }
    )
    val state by vm.state.collectAsStateWithLifecycle()

    LaunchedEffect(jobId) { vm.load(jobId) }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Preview", style = MaterialTheme.typography.headlineSmall)

        when (val s = state) {
            PreviewViewModel.State.Loading -> {
                Box(modifier = Modifier.fillMaxWidth().aspectRatio(9f / 16f),
                    contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            is PreviewViewModel.State.Ready -> {
                ExoPlayerBlock(url = s.url)
                OutlinedButton(
                    onClick = { share(context, s.url) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Share download link") }
            }
            is PreviewViewModel.State.Error -> {
                Text(s.message, color = MaterialTheme.colorScheme.error)
            }
        }

        Spacer(Modifier.height(8.dp))
        Button(onClick = onHome, modifier = Modifier.fillMaxWidth()) {
            Text("Make another")
        }
    }
}

@Composable
private fun ExoPlayerBlock(url: String) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) exoPlayer.pause()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            exoPlayer.release()
        }
    }

    AndroidView(
        factory = { ctx -> PlayerView(ctx).apply { player = exoPlayer } },
        modifier = Modifier.fillMaxWidth().aspectRatio(9f / 16f),
    )
}

private fun share(context: android.content.Context, url: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, url)
    }
    context.startActivity(Intent.createChooser(intent, "Share clip"))
}
