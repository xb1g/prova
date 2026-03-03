import { supabase } from './supabase'

export type MyGoal = {
  id: string
  title: string
  frequency_count: number | null
  frequency_unit: 'day' | 'week' | 'month' | null
  status: string
  streak: number
  participants: { user_id: string; status: string }[]
  created_at: string
}

export type GoalProof = {
  id: string
  goal_id: string
  user_id: string
  media_url: string | null
  media_type: string | null
  caption: string | null
  status: 'pending' | 'approved' | 'disputed'
  streak_period: string | null
  submitted_at: string
  reaction_count: number
  comment_count: number
  vote_summary: { approve: number; dispute: number }
}

export type PopularGoal = {
  title: string
  count: number
}

export async function fetchMyGoals(userId: string): Promise<MyGoal[]> {
  const { data: goals, error } = await supabase
    .from('goals')
    .select('id, title, frequency_count, frequency_unit, status, created_at, challenge_id')
    .eq('user_id', userId)

  if (error) throw error
  if (!goals) return []

  return Promise.all(
    goals.map(async (goal) => {
      // Fetch participants via challenge
      let participants: { user_id: string; status: string }[] = []
      if (goal.challenge_id) {
        const { data: parts } = await supabase
          .from('challenge_participants')
          .select('user_id, status')
          .eq('challenge_id', goal.challenge_id)
        participants = parts ?? []
      }

      // Streak: count of total approved proofs (simplified)
      const { count: streak } = await supabase
        .from('proofs')
        .select('id', { count: 'exact', head: true })
        .eq('goal_id', goal.id)
        .eq('status', 'approved')

      return {
        id: goal.id,
        title: goal.title,
        frequency_count: goal.frequency_count,
        frequency_unit: goal.frequency_unit,
        status: goal.status,
        streak: streak ?? 0,
        participants,
        created_at: goal.created_at,
      }
    })
  )
}

export async function fetchGoalProofs(goalId: string): Promise<GoalProof[]> {
  const { data: proofs, error } = await supabase
    .from('proofs')
    .select('id, goal_id, user_id, media_url, media_type, caption, status, streak_period, submitted_at')
    .eq('goal_id', goalId)
    .order('submitted_at', { ascending: false })

  if (error) throw error
  if (!proofs) return []

  return Promise.all(
    proofs.map(async (proof) => {
      const [{ count: reaction_count }, { count: comment_count }, { data: votes }] =
        await Promise.all([
          supabase
            .from('proof_reactions')
            .select('id', { count: 'exact', head: true })
            .eq('proof_id', proof.id),
          supabase
            .from('proof_comments')
            .select('id', { count: 'exact', head: true })
            .eq('proof_id', proof.id),
          supabase
            .from('proof_votes')
            .select('vote')
            .eq('proof_id', proof.id),
        ])

      const vote_summary = (votes ?? []).reduce(
        (acc, v) => {
          if (v.vote === 'approve') acc.approve++
          else if (v.vote === 'dispute') acc.dispute++
          return acc
        },
        { approve: 0, dispute: 0 }
      )

      return {
        ...proof,
        status: proof.status as GoalProof['status'],
        reaction_count: reaction_count ?? 0,
        comment_count: comment_count ?? 0,
        vote_summary,
      }
    })
  )
}

export async function fetchPopularGoals(): Promise<PopularGoal[]> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/get-popular-goals'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetchPopularGoals failed: ${res.status}`)
  return res.json()
}
