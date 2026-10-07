import { Global, Module } from '@nestjs/common';

import { SystemFeaturesService } from './system-features.service.js';

/** Global: la iglesia, la sincronizacion y la Biblia lo consultan. */
@Global()
@Module({
  providers: [SystemFeaturesService],
  exports: [SystemFeaturesService],
})
export class SystemFeaturesModule {}
