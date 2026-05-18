package ai.clipdirector

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

import ai.clipdirector.ui.clips.ClipSelectScreen
import ai.clipdirector.ui.prompt.PromptScreen
import ai.clipdirector.ui.processing.ProcessingScreen
import ai.clipdirector.ui.preview.PreviewScreen
import ai.clipdirector.ui.history.HistoryScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface { App() }
            }
        }
    }
}

@Composable
fun App() {
    // TODO Phase 2: real navigation graph, ViewModels, DI.
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = "clips") {
        composable("clips")      { ClipSelectScreen(onNext = { nav.navigate("prompt") }) }
        composable("prompt")     { PromptScreen(onSubmit = { nav.navigate("processing") }) }
        composable("processing") { ProcessingScreen(onComplete = { nav.navigate("preview") }) }
        composable("preview")    { PreviewScreen(onHome = { nav.navigate("clips") }) }
        composable("history")    { HistoryScreen() }
    }
}

@Preview
@Composable
fun PreviewApp() {
    MaterialTheme { Text("ClipDirector") }
}
