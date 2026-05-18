import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExperiment,
  deleteExperiment,
  getExperiment,
  listExperiments,
  updateExperimentStatus,
  updateVariantPostId,
  type CreateExperimentInput,
} from '@/services/experimentsService';

export function useExperimentsList(companyId: string | null) {
  return useQuery({
    queryKey: ['experiments', companyId],
    queryFn: () => listExperiments(companyId!),
    enabled: !!companyId,
  });
}

export function useExperiment(id: string | null) {
  return useQuery({
    queryKey: ['experiment', id],
    queryFn: () => getExperiment(id!),
    enabled: !!id,
  });
}

export function useCreateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExperimentInput) => createExperiment(input),
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ['experiments', vars.company_id] });
    },
  });
}

export function useDeleteExperiment(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExperiment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments', companyId] }),
  });
}

export function useUpdateExperimentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'running' | 'completed' | 'cancelled' }) =>
      updateExperimentStatus(id, status),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['experiment', vars.id] });
      qc.invalidateQueries({ queryKey: ['experiments'] });
    },
  });
}

export function useUpdateVariantPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, postId }: { variantId: string; postId: string | null }) =>
      updateVariantPostId(variantId, postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiment'] }),
  });
}
