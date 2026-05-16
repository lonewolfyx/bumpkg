import { ofetch } from 'ofetch'

vi.mock('ofetch', () => ({
    ofetch: vi.fn(async () => ({})),
}))

beforeEach(() => {
    vi.mocked(ofetch).mockImplementation(async () => ({}))
})
