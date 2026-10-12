'use client';

import React from 'react';
import { DescriptiveStatistics } from '@/components/DescriptiveStatistics';

import { useDatasetStore } from '@/store/dataset-store';

export interface AnalisisPageProps {
  _testDataset?: import('@/types').Dataset | null;
}

export default function AnalisisPage({ _testDataset }: AnalisisPageProps = {}) {
  const store = useDatasetStore();
  const activeDataset = _testDataset !== undefined ? _testDataset : store.activeDataset;

  return (
    <div className="space-y-6">
      <DescriptiveStatistics
        _testState={_testDataset !== undefined ? { activeDataset } : undefined}
      />
    </div>
  );
}
