/**
 * VIN Decoder Service
 * 
 * Uses the NHTSA Vehicle API (free, no key required) to decode VIN numbers.
 * In production, you could also use paid services for richer data.
 * 
 * NHTSA API: https://vpic.nhtsa.dot.gov/api/
 */

export interface VinDecodeResult {
  year: number;
  make: string;
  model: string;
  engine: string | null;
  driveType: string | null;
  trimLevel: string | null;
  bodyType: string | null;
  fuelType: string | null;
}

export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`VIN decode API error: ${response.status}`);
      return null;
    }

    const data: any = await response.json();
    const results = data.Results?.[0];

    if (!results || results.ErrorCode !== '0') {
      console.error('VIN decode returned errors:', results?.ErrorText);
      return null;
    }

    const year = parseInt(results.ModelYear, 10);
    if (isNaN(year)) return null;

    return {
      year,
      make: results.Make || '',
      model: results.Model || '',
      engine: [results.EngineConfiguration, results.DisplacementL ? `${results.DisplacementL}L` : '', results.EngineCylinders ? `${results.EngineCylinders}cyl` : '']
        .filter(Boolean).join(' ') || null,
      driveType: results.DriveType || null,
      trimLevel: results.Trim || null,
      bodyType: results.BodyClass || null,
      fuelType: results.FuelTypePrimary || null,
    };
  } catch (err) {
    console.error('VIN decode error:', err);
    return null;
  }
}
