package ai.clipdirector.ui.processing

import ai.clipdirector.MainDispatcherRule
import ai.clipdirector.data.job.JobRepository
import ai.clipdirector.data.job.JobStatus
import ai.clipdirector.data.job.JobStatusResponse
import app.cash.turbine.test
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ProcessingViewModelTest {

    @get:Rule
    val mainDispatcher = MainDispatcherRule()

    @Test
    fun `polling terminates immediately on COMPLETE status`() = runTest {
        val repo: JobRepository = mockk()
        coEvery { repo.getJobStatus("job1") } returns
            statusResponse("job1", JobStatus.COMPLETE, 100, "s3://bucket/out.mp4")
        val vm = ProcessingViewModel(repo)

        vm.state.test {
            // initial Connecting state
            assertTrue(awaitItem() is ProcessingViewModel.State.Connecting)
            vm.watch("job1")
            // single Complete emission, no further polling
            val item = awaitItem()
            assertTrue("expected Complete, got $item", item is ProcessingViewModel.State.Complete)
            advanceTimeBy(5_000)
            expectNoEvents()
        }
    }

    @Test
    fun `FAILED response with errorMessage surfaces that message exactly`() = runTest {
        val repo: JobRepository = mockk()
        coEvery { repo.getJobStatus("job2") } returns
            statusResponse("job2", JobStatus.FAILED, 0, errorMessage = "render exploded")
        val vm = ProcessingViewModel(repo)

        vm.watch("job2")
        vm.state.test {
            // Drain Connecting then await Failed
            var seen: ProcessingViewModel.State = awaitItem()
            while (seen !is ProcessingViewModel.State.Failed) seen = awaitItem()
            assertEquals("render exploded", (seen as ProcessingViewModel.State.Failed).message)
            cancel()
        }
    }

    @Test
    fun `repeated POLLING emissions advance through statuses before terminal`() = runTest {
        val repo: JobRepository = mockk()
        // First call: sampling. Second: rendering. Third: complete.
        var call = 0
        coEvery { repo.getJobStatus("job3") } answers {
            when (call++) {
                0 -> statusResponse("job3", JobStatus.SAMPLING, 10)
                1 -> statusResponse("job3", JobStatus.RENDERING, 60)
                else -> statusResponse("job3", JobStatus.COMPLETE, 100, "s3://bucket/o.mp4")
            }
        }
        val vm = ProcessingViewModel(repo)

        vm.watch("job3")
        vm.state.test {
            // initial Connecting
            assertTrue(awaitItem() is ProcessingViewModel.State.Connecting)
            // first poll -> Polling(SAMPLING)
            val first = awaitItem() as ProcessingViewModel.State.Polling
            assertEquals(JobStatus.SAMPLING, first.response.status)
            // advance past 2s delay
            advanceTimeBy(2_100)
            val second = awaitItem() as ProcessingViewModel.State.Polling
            assertEquals(JobStatus.RENDERING, second.response.status)
            // advance again
            advanceTimeBy(2_100)
            val third = awaitItem()
            assertTrue(
                "expected Complete after 3 polls, got $third",
                third is ProcessingViewModel.State.Complete
            )
            expectNoEvents()
        }
    }

    private fun statusResponse(
        jobId: String,
        status: JobStatus,
        progress: Int,
        outputUrl: String? = null,
        errorMessage: String? = null,
    ) = JobStatusResponse(
        jobId = jobId,
        userId = "u1",
        status = status,
        progress = progress,
        outputUrl = outputUrl,
        errorMessage = errorMessage,
        createdAt = "2026-05-19T00:00:00Z",
        updatedAt = "2026-05-19T00:00:00Z",
    )
}
