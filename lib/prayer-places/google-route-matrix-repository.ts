import type {
  TravelTimeMatrixResult,
  TravelTimeRepository,
  TravelTimeRequest,
  TravelTimeResult,
} from './travel-time-repository';

interface RouteMatrixApiResponse {
  results?: TravelTimeResult[];
  error?: string;
}

/**
 * Calls PrayerStop's own server-side API route (app/api/route-matrix+api.ts)
 * — never Google directly. The Google Routes API key lives only on that
 * server route; this client-side module never sees it, so it can't end up
 * in the mobile bundle. Mirrors google-places-repository.ts.
 */
export class GoogleRouteMatrixRepository implements TravelTimeRepository {
  async getTravelTimes(request: TravelTimeRequest): Promise<TravelTimeMatrixResult> {
    let response: Response;
    try {
      response = await fetch('/api/route-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not reach the travel-time service.',
      };
    }

    let body: RouteMatrixApiResponse;
    try {
      body = await response.json();
    } catch {
      return { status: 'error', message: 'The travel-time service returned an unreadable response.' };
    }

    if (!response.ok) {
      return { status: 'error', message: body.error ?? `Request failed (${response.status}).` };
    }
    if (!Array.isArray(body.results)) {
      return { status: 'error', message: 'Unexpected response shape from the travel-time service.' };
    }

    return { status: 'ok', results: body.results };
  }
}

export const googleRouteMatrixRepository: TravelTimeRepository = new GoogleRouteMatrixRepository();
