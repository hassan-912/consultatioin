import { runContract } from './repo.contract'
import { createLocalRepo, resetLocalRepo } from './local'
import { skipTime } from '../store/actions'

runContract('local', () => {
  resetLocalRepo()
  return { repo: createLocalRepo(), advanceTime: skipTime }
})
