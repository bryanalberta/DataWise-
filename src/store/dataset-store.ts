import { create } from 'zustand';
import { Dataset, DataType, RecipeStep } from '../types';

interface DatasetState {
  // --- Data States ---
  activeDataset: Dataset | null;
  datasetPreview: readonly Record<string, unknown>[]; // Baris pratinjau FND-03
  dataQualityStats: import('../types').DataQualitySummary | null;
  descriptiveStats: import('../types').DescriptiveStatisticsSummary | null;
  datasetIntelligence: import('../types').DatasetIntelligenceResult | null;
  activeRecipe: readonly RecipeStep[]; // Riwayat Recipe FNC-04

  // --- Async Operation States ---
  isProcessing: boolean;
  currentTaskId: string | null;
  processingMessage: string | null;
  error: string | null;

  // --- Actions ---
  setDataset: (dataset: Dataset, preview?: readonly Record<string, unknown>[]) => void;
  clearDataset: () => void;
  
  // Status management
  startProcessing: (taskId: string, message: string) => void;
  stopProcessing: () => void;
  setError: (error: string) => void;
  clearError: () => void;
  overrideColumnType: (columnId: string, newType: DataType) => void;
  setDataQualityStats: (stats: import('../types').DataQualitySummary | null) => void;
  setDescriptiveStats: (stats: import('../types').DescriptiveStatisticsSummary | null) => void;
  setDatasetIntelligence: (intelligence: import('../types').DatasetIntelligenceResult | null) => void;
  setRecipeSteps: (steps: readonly RecipeStep[]) => void;
  updateActiveDatasetAfterCleaning: (
    updatedDataset: Dataset,
    preview?: readonly Record<string, unknown>[],
    recipe?: readonly RecipeStep[]
  ) => void;
}

export const useDatasetStore = create<DatasetState>((set) => ({
  activeDataset: null,
  datasetPreview: [],
  dataQualityStats: null,
  descriptiveStats: null,
  datasetIntelligence: null,
  activeRecipe: [],

  isProcessing: false,
  currentTaskId: null,
  processingMessage: null,
  error: null,

  setDataset: (dataset, preview = []) => 
    set(() => ({ 
      activeDataset: dataset, 
      datasetPreview: preview,
      dataQualityStats: null, // Reset stats when loading new dataset
      descriptiveStats: null, // Reset descriptive stats when loading new dataset
      datasetIntelligence: null, // Reset intelligence when loading new dataset
      activeRecipe: [], // Reset recipe on new dataset
      error: null 
    })),
    
  clearDataset: () => 
    set(() => ({ 
      activeDataset: null, 
      datasetPreview: [],
      dataQualityStats: null,
      descriptiveStats: null,
      datasetIntelligence: null,
      activeRecipe: [],
      error: null,
      isProcessing: false,
      currentTaskId: null,
      processingMessage: null
    })),

  startProcessing: (taskId, message) =>
    set(() => ({
      isProcessing: true,
      currentTaskId: taskId,
      processingMessage: message,
      error: null
    })),

  stopProcessing: () =>
    set(() => ({
      isProcessing: false,
      currentTaskId: null,
      processingMessage: null
    })),

  setError: (error) =>
    set(() => ({
      error,
      isProcessing: false,
      currentTaskId: null,
      processingMessage: null
    })),

  clearError: () =>
    set(() => ({
      error: null
    })),

  overrideColumnType: (columnId: string, newType: DataType) =>
    set((state) => {
      if (!state.activeDataset) return state;

      const updatedColumns = state.activeDataset.columns.map((col) => {
        if (col.id === columnId) {
          let originalType = col.originalType;
          if (!originalType) {
            originalType = col.type; // Save the inferred type before changing
          }

          if (newType === originalType) {
            return {
              ...col,
              type: newType,
              originalType: undefined
            };
          }

          return {
            ...col,
            type: newType,
            originalType
          };
        }
        return col;
      });

      return {
        activeDataset: {
          ...state.activeDataset,
          columns: updatedColumns
        },
        descriptiveStats: null,
        datasetIntelligence: null
      };
    }),
    
  setDataQualityStats: (stats) => 
    set(() => ({ dataQualityStats: stats })),

  setDescriptiveStats: (stats) =>
    set(() => ({ descriptiveStats: stats })),

  setDatasetIntelligence: (intelligence) =>
    set(() => ({ datasetIntelligence: intelligence })),

  setRecipeSteps: (steps) =>
    set(() => ({ activeRecipe: steps })),

  updateActiveDatasetAfterCleaning: (updatedDataset, preview, recipe) =>
    set((state) => ({
      activeDataset: updatedDataset,
      datasetPreview: preview ?? state.datasetPreview,
      activeRecipe: recipe ?? state.activeRecipe,
      dataQualityStats: null, // Reset data quality to recalculate on active dataset
      descriptiveStats: null, // Reset descriptive stats to recalculate on active dataset
      datasetIntelligence: null, // Reset intelligence to recalculate on cleaned dataset
      error: null
    }))
}));
