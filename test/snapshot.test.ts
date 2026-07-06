import { describe, expect, it } from 'vitest';
import { format, readCorpus } from './format.js';

/**
 * Snapshot tests for representative corpus files, covering the full language:
 * classes/interfaces/enumerations/associations/projections/services, criteria
 * chains, validations, multiplicities, and comments. Snapshots capture the
 * exact formatted output so unintended changes to the printer are caught.
 */

const REPRESENTATIVE = [
  // Full language: user/class/interface/enum/association/projection/service + criteria.
  'xample-projects_stackoverflow_stackoverflow-domain-model_src_main_resources_com_stackoverflow_stackoverflow.klass',
  // Projections, nested and referenced.
  'xample-projects_stackoverflow_stackoverflow-klass-projections_src_test_resources_cool_klass_generator_klass_projection_com.stackoverflow.klass',
  // Services with urls, query params, criteria, orderBy.
  'xample-projects_stackoverflow_stackoverflow-klass-services_src_test_resources_cool_klass_generator_klass_service_com.stackoverflow.klass',
  // Small association-only file (canonical single-space style).
  'klass-model-converters_klass-compiler-tests_src_test_inputresources_cool_klass_model_converter_compiler_annotation_association_PluralAssociationTest.klass',
  // Inheritance: abstract, extends, implements.
  'xample-projects_reladomo-to-many-abstract_reladomo-to-many-abstract-domain-model_src_main_resources_com_repro_reladomo_tomanyabstract_reladomo-to-many-abstract.klass',
];

describe('formatting snapshots', () => {
  for (const file of REPRESENTATIVE) {
    it(`formats ${file}`, async () => {
      const formatted = await format(readCorpus(file));
      expect(formatted).toMatchSnapshot();
    });
  }
});
