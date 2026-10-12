'use client';

import React from 'react';
import { VisualizationStudio } from '@/components/VisualizationStudio';
import { Dataset } from '@/types';

export interface VisualisasiPageProps {
  _testDataset?: Dataset | null;
}

export default function VisualisasiPage({ _testDataset }: VisualisasiPageProps = {}) {
  return <VisualizationStudio _testDataset={_testDataset} />;
}

