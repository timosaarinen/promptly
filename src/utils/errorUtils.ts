/**
 * Extracts an error message from an unknown error object.
 *
 * @param error - The error object to extract the message from.
 * @returns A string representing the error message. If the error is an instance of `Error`,
 *          its `message` property is returned. If the error is a string, it is returned directly.
 *          Otherwise, a generic "An unknown error occurred." message is returned.
 *
 * @example
 * try {
 *   ...some code that might throw an error...
 * } catch (error: unknown) {
 *   const errorMessage = getErrorMessage(error);
 *   console.error(errorMessage);
 * }
 */
export function getErrorMessage(error: unknown, fallbackMsg: string = 'An unknown error occured.'): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else {
    return fallbackMsg;
  }
}
