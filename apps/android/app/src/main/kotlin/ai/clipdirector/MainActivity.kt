package ai.clipdirector

import ai.clipdirector.data.error.ErrorBus
import ai.clipdirector.ui.auth.LoginScreen
import ai.clipdirector.ui.auth.RegisterScreen
import ai.clipdirector.ui.clips.ClipSelectScreen
import ai.clipdirector.ui.components.BrandTopBar
import ai.clipdirector.ui.components.OverflowItem
import ai.clipdirector.ui.history.HistoryScreen
import ai.clipdirector.ui.preview.PreviewScreen
import ai.clipdirector.ui.processing.ProcessingScreen
import ai.clipdirector.ui.prompt.PromptScreen
import ai.clipdirector.ui.theme.ClipDirectorTheme
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val hasTokens = runBlocking { appContainer.tokenStore.current() != null }
        setContent {
            ClipDirectorTheme {
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
    val scope = rememberCoroutineScope()
    val container = androidx.compose.ui.platform.LocalContext.current.appContainer

    LaunchedEffect(Unit) {
        ErrorBus.messages.collect { msg -> snackbarHostState.showSnackbar(msg) }
    }

    val backStackEntry by nav.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    val onLogout = {
        scope.launch {
            container.authRepository.logout()
            nav.navigate("login") {
                popUpTo(nav.graph.findStartDestination().id) { inclusive = true }
            }
        }
        Unit
    }

    Scaffold(
        topBar = {
            when {
                currentRoute == null || currentRoute == "login" || currentRoute == "register" -> Unit
                currentRoute == "clips" -> BrandTopBar(
                    title = "ClipDirector",
                    overflowItems = listOf(
                        OverflowItem("History") { nav.navigate("history") },
                        OverflowItem("Logout") { onLogout() },
                    ),
                )
                currentRoute == "prompt" -> BrandTopBar(
                    title = "Director's brief",
                    onBack = { nav.popBackStack() },
                )
                currentRoute.startsWith("processing/") -> BrandTopBar(
                    title = "Processing",
                )
                currentRoute.startsWith("preview/") -> BrandTopBar(
                    title = "Preview",
                    onBack = { nav.popBackStack() },
                )
                currentRoute == "history" -> BrandTopBar(
                    title = "History",
                    onBack = { nav.popBackStack() },
                )
                else -> Unit
            }
        },
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
                        nav.navigate("clips") { popUpTo("login") { inclusive = true } }
                    },
                    onNavigateToRegister = { nav.navigate("register") },
                )
            }
            composable("register") {
                RegisterScreen(
                    onRegistered = {
                        nav.navigate("clips") { popUpTo("login") { inclusive = true } }
                    },
                    onNavigateToLogin = { nav.popBackStack("login", inclusive = false) },
                )
            }

            composable("clips") {
                ClipSelectScreen(onNext = { nav.navigate("prompt") })
            }
            composable("prompt") {
                PromptScreen(onSubmit = { jobId ->
                    nav.navigate("processing/$jobId") {
                        popUpTo("clips") { inclusive = false }
                    }
                })
            }
            composable(
                route = "processing/{jobId}",
                arguments = listOf(navArgument("jobId") { type = NavType.StringType }),
            ) { entry ->
                val jobId = entry.arguments?.getString("jobId").orEmpty()
                ProcessingScreen(
                    jobId = jobId,
                    onComplete = { id ->
                        nav.navigate("preview/$id") {
                            popUpTo("clips") { inclusive = false }
                        }
                    },
                    onRetry = { nav.popBackStack("prompt", inclusive = false) },
                )
            }
            composable(
                route = "preview/{jobId}",
                arguments = listOf(navArgument("jobId") { type = NavType.StringType }),
            ) { entry ->
                val jobId = entry.arguments?.getString("jobId").orEmpty()
                PreviewScreen(
                    jobId = jobId,
                    onHome = {
                        nav.navigate("clips") {
                            popUpTo("clips") { inclusive = true }
                        }
                    },
                )
            }
            composable("history") {
                HistoryScreen(onOpenComplete = { id -> nav.navigate("preview/$id") })
            }
        }
    }
}

// Import shim for findStartDestination
private fun androidx.navigation.NavGraph.findStartDestination() = this.findNode(this.startDestinationId)
    ?: throw IllegalStateException("Start destination not found in nav graph")
