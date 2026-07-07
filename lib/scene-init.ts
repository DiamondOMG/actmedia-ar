import * as THREE from 'three';
import { positionProvider } from './ar-core/position_provider';
import { NavigationArrow } from './ar-navigate/arrow';
import { findShortestPath, getDistance } from './ar-navigate/navigation';
import { StoreData } from './ar-navigate/store_loader';

declare const XR8: any;

export const initScenePipelineModule = (storeData: StoreData | null) => {
  let navArrow: NavigationArrow | null = null;
  const clock = new THREE.Clock();

  let currentPath: string[] = [];
  let currentWaypointIndex = 0;
  let isArrived = false;

  // ponytail: variables for segment-based drift correction to avoid accumulated SLAM scale errors
  let last_provider_pos = new THREE.Vector3(0, 0, 0);
  let prev_waypoint_pos = new THREE.Vector3(0, 0, 0);
  let is_segment_initialized = false;
  // ponytail: turn-zone state machine — advance arrow on entry, segment-reset on exit
  // ceiling: assumes waypoints are spaced > 2×radius apart
  let in_turn_zone = false;
  // ponytail: continuous heading correction every 1m during straight walks
  let last_correction_pos = new THREE.Vector3(0, 0, 0);

  const initXrScene = ({ scene, camera, renderer }: any) => {
    renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    navArrow = new NavigationArrow(scene, { color: '#AD50FF', animation: 'bounce' });

    if (storeData) {
      const startId = positionProvider.nav_start_id || 'W1';
      const targetId = positionProvider.nav_target_id || 'W5';
      const path = findShortestPath(storeData.waypoints, storeData.edges, startId, targetId);
      if (path) {
        currentPath = path;
        currentWaypointIndex = 1;
      }
    }

    const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
    planeGeometry.rotateX(-Math.PI / 2);
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.4 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.receiveShadow = true;
    scene.add(plane);

    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    originMarker.position.set(0, 0.05, 0);
    scene.add(originMarker);

    camera.position.set(0, 1.6, 0);
  };

  return {
    name: 'scene-init',

    onStart: ({ canvas }: any) => {
      const { scene, camera, renderer } = XR8.Threejs.xrScene();
      initXrScene({ scene, camera, renderer });

      canvas.addEventListener('touchmove', (e: Event) => e.preventDefault());

      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });

      canvas.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1) {
          XR8.XrController.recenter();
        }
      }, true);
    },

    onUpdate: () => {
      if (typeof XR8 === 'undefined') return;
      const { camera } = XR8.Threejs.xrScene();
      if (!camera) return;

      positionProvider.updateFromSlam(camera.position, camera.quaternion);

      // Update target or start point if user picked a new destination dynamically or scanned a new start node
      const currentStartId = positionProvider.nav_start_id || 'W1';
      const currentTargetId = positionProvider.nav_target_id || 'W5';
      const pathNeedsUpdate = currentPath.length === 0 || 
                              currentPath[currentPath.length - 1] !== currentTargetId || 
                              currentPath[0] !== currentStartId;

      if (storeData && pathNeedsUpdate) {
        const newPath = findShortestPath(storeData.waypoints, storeData.edges, currentStartId, currentTargetId);
        if (newPath) {
          currentPath = newPath;
          currentWaypointIndex = 1;
          isArrived = false;
          is_segment_initialized = false;
          in_turn_zone = false;
        }
      }

      if (navArrow && currentPath && currentPath.length > 0 && !isArrived) {
        const delta = clock.getDelta();
        const currentTargetId = currentPath[currentWaypointIndex];
        const targetWaypoint = storeData?.waypoints[currentTargetId];
        const provider_pos = positionProvider.position;

        if (targetWaypoint) {
          // Initialize segment origin when starting a new leg of navigation
          if (!is_segment_initialized) {
            const prev_id = currentPath[currentWaypointIndex - 1];
            const prev_wp = storeData?.waypoints[prev_id];
            if (prev_wp) {
              prev_waypoint_pos.set(prev_wp.x, provider_pos.y, prev_wp.z);
            } else {
              prev_waypoint_pos.set(0, provider_pos.y, 0);
            }
            last_provider_pos.copy(provider_pos);
            is_segment_initialized = true;
            last_correction_pos.copy(prev_waypoint_pos);
          }

          // Calculate delta movement from the last waypoint using calibrated coords
          const delta_pos = new THREE.Vector3().subVectors(provider_pos, last_provider_pos);
          
          // Adjusted position starts from the real waypoint coords + camera delta
          const adjusted_user_pos = new THREE.Vector3().addVectors(prev_waypoint_pos, delta_pos);

          navArrow.updatePosition(camera.position, camera.quaternion);

          const dist = getDistance(
            { x: adjusted_user_pos.x, z: adjusted_user_pos.z, label: '' },
            targetWaypoint
          );

          const proximity_radius = storeData?.proximity_radius_m || 1.5;

          if (!in_turn_zone) {
            // ── NORMAL MODE: ชี้ไป waypoint ปัจจุบัน, แสดงระยะ ──
            navArrow.setTarget(adjusted_user_pos, targetWaypoint);

            positionProvider.nav_debug = {
              targetId: currentTargetId,
              targetPos: `(${targetWaypoint.x}, ${targetWaypoint.z})`,
              distance: dist.toFixed(2),
              isArrived,
              inTurnZone: false
            };

            // ponytail: continuous heading correction — ทุก 1m เทียบทิศเดินจริง vs ทิศจากแผนที่
            // ceiling: assumes user walks roughly toward the next waypoint
            const walk_dist = Math.sqrt(
              (adjusted_user_pos.x - last_correction_pos.x) ** 2 +
              (adjusted_user_pos.z - last_correction_pos.z) ** 2
            );
            if (walk_dist > 1.0) {
              const prev_wp = storeData?.waypoints[currentPath[currentWaypointIndex - 1]];
              if (prev_wp) {
                const actual_angle = Math.atan2(
                  adjusted_user_pos.x - prev_wp.x,
                  adjusted_user_pos.z - prev_wp.z
                );
                const expected_angle = Math.atan2(
                  targetWaypoint.x - prev_wp.x,
                  targetWaypoint.z - prev_wp.z
                );
                let correction = expected_angle - actual_angle;
                while (correction > Math.PI) correction -= 2 * Math.PI;
                while (correction < -Math.PI) correction += 2 * Math.PI;
                // guard: < 15° only — ถ้ามุมมากแปลว่า user เดินเฉียงจริงๆ ไม่ใช่ drift
                if (Math.abs(correction) < Math.PI / 12) {
                  positionProvider.headingOffsetRad += correction;
                }
              }
              last_correction_pos.copy(adjusted_user_pos);
            }

            // เข้ารัศมี → advance ลูกศรไปจุดถัดไปทันที + เข้า turn zone
            if (dist < proximity_radius) {
              if (currentWaypointIndex < currentPath.length - 1) {
                currentWaypointIndex++;
                in_turn_zone = true;
                // ลูกศรชี้ไปจุดถัดไปทันที
                const nextWp = storeData?.waypoints[currentPath[currentWaypointIndex]];
                if (nextWp) navArrow.setTarget(adjusted_user_pos, nextWp);
                positionProvider.nav_debug = {
                  targetId: currentPath[currentWaypointIndex],
                  targetPos: nextWp ? `(${nextWp.x}, ${nextWp.z})` : '',
                  distance: '',
                  isArrived: false,
                  inTurnZone: true
                };
              } else {
                isArrived = true;
                positionProvider.nav_debug = { ...positionProvider.nav_debug, isArrived: true };
              }
            }
          } else {
            // ── TURN ZONE: ลูกศรชี้จุดถัดไปอยู่แล้ว, ซ่อนระยะ ──
            const turnTargetWp = storeData?.waypoints[currentPath[currentWaypointIndex]];
            if (turnTargetWp) navArrow.setTarget(adjusted_user_pos, turnTargetWp);

            // วัดระยะจาก waypoint ที่เพิ่งผ่าน (ตัวก่อน currentWaypointIndex)
            const passedWp = storeData?.waypoints[currentPath[currentWaypointIndex - 1]];
            const dist_from_passed = passedWp ? getDistance(
              { x: adjusted_user_pos.x, z: adjusted_user_pos.z, label: '' },
              passedWp
            ) : 0;

            positionProvider.nav_debug = {
              targetId: currentPath[currentWaypointIndex],
              targetPos: turnTargetWp ? `(${turnTargetWp.x}, ${turnTargetWp.z})` : '',
              distance: '',
              isArrived: false,
              inTurnZone: true
            };

            // ออกจากรัศมี (เดินตรงไป 1.5m จากจุดเลี้ยว) → segment reset + heading correction
            if (dist_from_passed > proximity_radius) {
              // ponytail: heading drift correction — ใช้ทิศเดินตรงของ user เทียบกับทิศจากแผนที่
              // ceiling: assumes user walks straight after turning; noisy if they zigzag
              if (passedWp && turnTargetWp) {
                const actual_angle = Math.atan2(
                  adjusted_user_pos.x - passedWp.x,
                  adjusted_user_pos.z - passedWp.z
                );
                const expected_angle = Math.atan2(
                  turnTargetWp.x - passedWp.x,
                  turnTargetWp.z - passedWp.z
                );
                let correction = expected_angle - actual_angle;
                // normalize to [-π, π]
                while (correction > Math.PI) correction -= 2 * Math.PI;
                while (correction < -Math.PI) correction += 2 * Math.PI;
                // guard: ignore if > 30° (likely bad data, not drift)
                if (Math.abs(correction) < Math.PI / 6) {
                  positionProvider.headingOffsetRad += correction;
                }
              }

              in_turn_zone = false;
              is_segment_initialized = false; // trigger segment reset ชดเชย position drift
            }
          }

          navArrow.update(delta);
        }
      }
    },
  };
};
