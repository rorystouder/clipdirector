package ai.clipdirector.ui.clips

import ai.clipdirector.MainDispatcherRule
import ai.clipdirector.data.job.SubmissionDraft
import android.content.ContentResolver
import android.net.Uri
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClipSelectViewModelTest {

    @get:Rule
    val mainDispatcher = MainDispatcherRule()

    private val contentResolver: ContentResolver = mockk(relaxed = true)
    private val draft = SubmissionDraft()

    private fun newVm() = ClipSelectViewModel(
        contentResolver = contentResolver,
        submissionDraft = draft,
        ioDispatcher = mainDispatcher.testDispatcher,
    )

    @Test
    fun `confirmAndProceed with no clips sets error and does not callback`() = runTest {
        val vm = newVm()
        var called = false
        vm.confirmAndProceed { called = true }
        advanceUntilIdle()

        assertEquals("Select at least one clip", vm.error.value)
        assertTrue("callback must not fire when no clips selected", !called)
        assertEquals(0, draft.clips.value.size)
    }

    @Test
    fun `setSelection rejects more than MAX_CLIPS`() = runTest {
        val vm = newVm()
        val uris = List(ClipSelectViewModel.MAX_CLIPS + 1) { fakeUri("c$it") }

        vm.setSelection(uris)
        advanceUntilIdle()

        assertNotNull("error should be set for >MAX selection", vm.error.value)
        assertEquals("clips should not be added when over limit", 0, vm.clips.value.size)
    }

    @Test
    fun `valid selection populates draft and fires onValid`() = runTest {
        val vm = newVm()
        val uris = listOf(fakeUri("a"), fakeUri("b"))
        vm.setSelection(uris)
        advanceUntilIdle()
        assertEquals(2, vm.clips.value.size)
        assertNull(vm.error.value)

        var called = false
        vm.confirmAndProceed { called = true }
        advanceUntilIdle()

        assertTrue("onValid must be called for valid selection", called)
        assertEquals(uris.toSet(), draft.clips.value.toSet())
    }

    private fun fakeUri(id: String): Uri {
        val uri = mockk<Uri>()
        every { uri.toString() } returns "content://test/$id"
        every { uri.hashCode() } returns id.hashCode()
        every { uri.equals(any()) } answers { (it.invocation.args.first() as? Uri)?.toString() == "content://test/$id" }
        return uri
    }
}
