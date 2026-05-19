package ai.clipdirector.data.error

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * App-wide bus for user-visible error strings. Hoisted to a top-level
 * Scaffold + SnackbarHost in MainActivity. Repositories call [report]
 * with the message returned by [ApiErrorAdapter].
 *
 * extraBufferCapacity + DROP_OLDEST so the bus never blocks a producer
 * if the UI isn't actively collecting.
 */
object ErrorBus {
    private val _messages = MutableSharedFlow<String>(
        replay = 0,
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    suspend fun report(message: String) {
        _messages.emit(message)
    }

    fun tryReport(message: String) {
        _messages.tryEmit(message)
    }
}
