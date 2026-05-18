package ai.clipdirector.ui.prompt

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun PromptScreen(onSubmit: () -> Unit) {
    // TODO Phase 2: prompt TextField (max MAX_PROMPT_LENGTH=500), platform selector,
    //               music mood selector, caption style selector, submit -> POST /jobs.
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Director Brief", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        Text("TODO: prompt + platform + music mood + caption style")
        Spacer(Modifier.height(16.dp))
        Button(onClick = onSubmit) { Text("Render") }
    }
}
