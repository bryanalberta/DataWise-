'use client';

import React from 'react';
import { DatasetIntelligenceView } from '@/components/DatasetIntelligenceView';
import { Dataset, DatasetIntelligenceResult } from '@/types';

export interface InsightPageProps {
  readonly _testDataset?: Dataset | null;
  readonly _testIntelligence?: DatasetIntelligenceResult | null;
}

export default function InsightPage({
  _testDataset,
  _testIntelligence,
}: InsightPageProps = {}) {
  return (
    <DatasetIntelligenceView
      _testDataset={_testDataset}
      _testIntelligence={_testIntelligence}
    />
  );
}
