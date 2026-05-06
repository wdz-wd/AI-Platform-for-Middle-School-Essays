import { create } from 'zustand'

type TaskPageState = {
  pageByTaskId: Record<string, number>
  getTaskPage: (taskId: string) => number
  setTaskPage: (taskId: string, page: number) => void
}

export const useTaskPageStore = create<TaskPageState>((set, get) => ({
  pageByTaskId: {},
  getTaskPage: (taskId) => get().pageByTaskId[taskId] ?? 1,
  setTaskPage: (taskId, page) =>
    set((state) => ({
      pageByTaskId: {
        ...state.pageByTaskId,
        [taskId]: page,
      },
    })),
}))
