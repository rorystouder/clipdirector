package ai.clipdirector

import ai.clipdirector.data.error.ErrorBus
import ai.clipdirector.ui.auth.LoginScreen
import ai.clipdirector.ui.auth.RegisterScreen
import ai.clipdirector.ui.clips.ClipSelectScreen
import ai.clipdirector.ui.history.HistoryScreen
import ai.clipdirector.ui.preview.PreviewScreen
import ai.clipdirector.ui.processing.ProcessingScreen
import ai.clipdirector.ui.prompt.PromptScreen
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.runBlocking

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Read tokens synchronously to pick start destination — runs once on
        // activity creation. DataStore read is cheap after hydration.
        val hasTokens = runBlocking { appContainer.tokenStore.current() != null }
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ClipDirectorApp(startWithAuth = !hasTokens)
                }
            }
        }
    }
}

@Composable
private fun ClipDirectorApp(startWithAuth: Boolean) {
    val nav = rememberNavController()
    val snackbarHostState = remember { SnackbarHostState() }

    // Wire ErrorBus messages to the snackbar — one collector, lives for the
    // lifetime of the composition.
    LaunchedEffect(Unit) {
        ErrorBus.messages.collect { msg ->
            snackbarHostState.showSnackbar(msg)
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = Modifier.fillMaxSize(),
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = if (startWithAuth) "login" else "clips",
            modifier = Modifier.padding(padding),
        ) {
            composable("login") {
                LoginScreen(
                    onLoggedIn = {
                        nav.navigate("clips") {
                            popUpTo("login") { inclusive = true }
                        }
                    },
                    onNavigateToRegister = { nav.navigate("register") },
                )
            }
            composable("register") {
                RegisterScreen(
                    onRegistered = {
                        nav.navigate("clips") {
                            popUpTo("login") { inclusive = true }
                        }
                    },
                    onNavigateToLogin = { nav.popBackStack("login", inclusive = false) },
                )
            }

            composable("clips") {
                ClipSelectScreen(onNext = { nav.navigate("prompt") })
            }
            composable("prompt") {
                PromptScreen(onSubmit = { nav.navigate("processing") })
            }
            composable("processing") {
                ProcessingScreen(onComplete = { nav.navigate("preview") })
            }
            composable("preview") {
                PreviewScreen(onHome = { nav.navigate("clips") })
            }
            composable("history") {
                HistoryScreen()
            }
        }
    }
}
