# Implementation Notes

## Task 1: Dispatch

- Implemented branch assignment with priority rules: `manual`, `single`, `pickup_point`, `city`, and `geo`.
- Added nearest-branch selection using geographic distance.
- Added a 42 km maximum distance for automatic geo assignment.
- Added daily branch capacity limits using the Almaty timezone (UTC+5).
- If a selected branch is full, the system searches for the nearest available branch of the same store.
- Manual assignments bypass daily capacity limits.
- Added assignment and branch load API endpoints.
- Repeated assignment requests are idempotent.

## Task 2: Booking

- Implemented available time slot calculation with 15-minute intervals.
- Added working hours, breaks, existing bookings, and current time validation.
- Added a 7-minute cleanup period after each booking.
- Booking times are stored in UTC; schedules use Almaty local time (UTC+5).
- Added Kazakhstan phone number validation and normalization.
- Added booking creation, cancellation, and validation API endpoints.
- Cancellation is not allowed less than 2 hours before the booking.
- Added an in-memory lock per master and date to prevent concurrent double booking within a single Node.js process.

## Concurrency in production

For multiple application instances, in-memory locks are insufficient. PostgreSQL should handle concurrency using database transactions and row-level locking (`SELECT ... FOR UPDATE`) for the relevant master and date. Availability must be checked again inside the transaction before inserting a booking. This ensures that concurrent requests cannot reserve the same time slot.

## Testing

- Added dispatch routing and capacity tests.
- Added booking slot calculation tests.
- Added API tests for concurrent booking creation and repeated cancellation.
- All 19 tests pass.
- TypeScript typecheck passes.

## Assumptions

- All schedule times are interpreted in the Almaty timezone (UTC+5).
- Booking intervals are treated as half-open intervals, so adjacent bookings do not overlap.
- Cancelled bookings do not block available time slots.
- Storage is in-memory as required by the assignment.