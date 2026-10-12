'use client';

import React from 'react';
import { DataGrid } from '@/components/DataGrid';

import { useDatasetStore } from '@/store/dataset-store';

export interface DatasetPageProps {
  _testDataset?: import('@/types').Dataset | null;
}

export default function DatasetPage({ _testDataset }: DatasetPageProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;

  return (
    <div className="space-y-6">
      <DataGrid
        id="data-explorer-grid"
        _testState={_testDataset !== undefined ? { activeDataset } : undefined}
      />
    </div>
  );
}
