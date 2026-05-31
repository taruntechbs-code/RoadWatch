import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { classifyComplaint, submitComplaint, uploadImage } from '../api/complaints.js';
import { getRoadById, searchRoads } from '../api/roads.js';

const MIN_DESCRIPTION_LENGTH = 25;

const issueTypes = [
  { icon: 'P', label: 'Pothole' },
  { icon: 'W', label: 'Waterlogging' },
  { icon: 'C', label: 'Surface Crack' },
  { icon: 'U', label: 'Unfinished Work' },
  { icon: 'S', label: 'Shoulder Damage' },
  { icon: 'G', label: 'Signage Issue' },
];

const emptyForm = {
  road_id: '',
  road_name: '',
  issue_types: [],
  description: '',
  lat: '',
  lng: '',
  media_url: '',
};

function StepIndicator({ step }) {
  return (
    <div className="mb-6 grid grid-cols-3 gap-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
              item <= step ? 'bg-[#38bdf8] text-[#0f172a]' : 'bg-[#334155] text-[#94a3b8]'
            }`}
          >
            {item}
          </span>
          <span className="hidden text-sm font-semibold text-[#f1f5f9] sm:inline">Step {item}</span>
        </div>
      ))}
    </div>
  );
}

function isValidCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ComplaintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const geolocationSettledRef = useRef(false);
  const initialRoadId = params.get('road_id') || '';
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [roadQuery, setRoadQuery] = useState('');
  const [roadResults, setRoadResults] = useState([]);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [classification, setClassification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!initialRoadId) return;
    let active = true;
    getRoadById(initialRoadId)
      .then((road) => {
        if (!active) return;
        setForm((current) => ({ ...current, road_id: road.road_id, road_name: road.road_name }));
      })
      .catch(() => setError('Unable to load the selected road.'));
    return () => {
      active = false;
    };
  }, [initialRoadId]);

  useEffect(() => {
    let active = true;
    geolocationSettledRef.current = false;

    if (!navigator.geolocation) {
      console.debug('RoadWatch geolocation unavailable in this browser');
      setLocationStatus('failed');
      return () => {
        active = false;
      };
    }

    setLocationStatus('requesting');
    console.debug('RoadWatch geolocation permission requested');

    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permissionStatus) => {
        console.debug('RoadWatch geolocation permission state:', permissionStatus.state);
      })
      .catch((permissionError) => {
        console.debug('RoadWatch geolocation permission query unavailable:', permissionError?.message);
      });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active || geolocationSettledRef.current) return;

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        console.debug('RoadWatch geolocation success received:', latitude, longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          geolocationSettledRef.current = true;
          setLocationStatus('failed');
          return;
        }

        geolocationSettledRef.current = true;
        setForm((current) => ({
          ...current,
          lat: latitude.toFixed(6),
          lng: longitude.toFixed(6),
        }));
        setLocationStatus('success');
      },
      (geoError) => {
        if (!active || geolocationSettledRef.current) return;

        geolocationSettledRef.current = true;
        console.debug('RoadWatch geolocation error:', geoError.code, geoError.message);
        setLocationStatus(geoError.code === geoError.PERMISSION_DENIED ? 'denied' : 'failed');
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      },
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const query = roadQuery.trim();
    if (!query || form.road_id) {
      setRoadResults([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchRoads(query);
        setRoadResults(results.slice(0, 8));
      } catch {
        setRoadResults([]);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [roadQuery, form.road_id]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const descriptionCount = form.description.length;
  const latValid = isValidCoordinate(form.lat, -90, 90);
  const lngValid = isValidCoordinate(form.lng, -180, 180);
  const canContinueStep1 = Boolean(form.road_id && latValid && lngValid);
  const showCoordinateInputs = ['success', 'denied', 'failed'].includes(locationStatus);
  const canContinueStep2 =
    form.issue_types.length > 0 &&
    descriptionCount >= MIN_DESCRIPTION_LENGTH &&
    descriptionCount <= 500 &&
    !uploadError;
  const selectedIssues = useMemo(
    () => issueTypes.filter((issue) => form.issue_types.includes(issue.label)),
    [form.issue_types],
  );

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const toggleIssue = (label) => {
    setForm((current) => {
      const selected = current.issue_types.includes(label);
      return {
        ...current,
        issue_types: selected
          ? current.issue_types.filter((issue) => issue !== label)
          : [...current.issue_types, label],
      };
    });
    setError('');
  };

  const chooseRoad = (road) => {
    setForm((current) => ({ ...current, road_id: road.road_id, road_name: road.road_name }));
    setRoadQuery(road.road_name);
    setRoadResults([]);
  };

  const choosePhoto = (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setUploadError('Upload a jpg, jpeg, png, or webp image up to 5MB.');
      return;
    }
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    updateForm('media_url', '');
    setUploadError('');
  };

  const removePhoto = () => {
    setPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview('');
    updateForm('media_url', '');
    setUploadError('');
  };

  const nextFromStep2 = async () => {
    if (!canContinueStep2) return;
    try {
      setLoading(true);
      setError('');
      let mediaUrl = form.media_url;
      if (photo && !mediaUrl) {
        setUploadError('');
        const uploadResult = await uploadImage(photo);
        mediaUrl = uploadResult.media_url;
        updateForm('media_url', mediaUrl);
      }

      const aiResult = await classifyComplaint({
        description: form.description,
        issue_types: classification?.normalized_issue_types || form.issue_types,
        road_id: form.road_id,
      });
      setClassification(aiResult);
      setStep(3);
    } catch (failure) {
      const detail = failure?.response?.data?.detail || 'AI analysis failed. Check API key setup and try again.';
      if (photo && !form.media_url && detail.toLowerCase().includes('upload')) {
        setUploadError(detail);
      } else {
        setError(detail);
      }
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await submitComplaint({
        road_id: form.road_id,
        issue_types: form.issue_types,
        description: form.description,
        lat: Number(form.lat),
        lng: Number(form.lng),
        media_url: form.media_url || null,
        severity: classification?.severity || 'Medium',
        ai_summary: classification?.summary_english || null,
        urgency_score: classification?.urgency_score || null,
        safety_risk: classification?.safety_risk ?? null,
        ai_reasoning: classification?.reasoning || null,
      });
      setSuccess(result);
    } catch (submitError) {
      setError(submitError?.response?.data?.detail || 'Complaint submission failed.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setForm(emptyForm);
    setRoadQuery('');
    setRoadResults([]);
    setPhoto(null);
    setPhotoPreview('');
    setUploadError('');
    setClassification(null);
    setSuccess(null);
    setError('');
  };

  const locationMessage = {
    idle: 'Location detection has not started.',
    requesting: 'Requesting location permission...',
    success: `Location detected: ${form.lat}, ${form.lng}`,
    denied: 'Location access denied. Enter coordinates manually.',
    failed: 'Unable to detect location. Enter coordinates manually.',
  }[locationStatus];

  if (success) {
    const routed = Boolean(success.assigned_authority_name);
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[#0f172a] px-4 py-8">
        <section className="mx-auto max-w-2xl rounded-xl bg-[#1e293b] p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-5xl text-white">
            ✓
          </div>
          <h1 className="text-3xl font-bold text-[#f1f5f9]">Complaint Submitted!</h1>
          <p className="mt-3 text-[#94a3b8]">{success.message}</p>
          <button
            type="button"
            className="mt-5 w-full rounded-xl bg-[#334155] p-4 font-mono text-sm text-[#38bdf8]"
            onClick={() => navigator.clipboard?.writeText(success.complaint_id)}
          >
            {success.complaint_id}
          </button>
          <div className="mt-5 space-y-2 text-sm text-[#f1f5f9]">
            <p>Submitted to: {success.road_name}</p>
            <p>Status: {success.status}</p>
            {routed ? (
              <>
                <p>Assigned to: {success.assigned_authority_name}</p>
                <p>
                  Officer: {success.assigned_officer}
                  {success.designation ? `, ${success.designation}` : ''}
                </p>
                <p>SLA: {success.sla_days} days</p>
                <p>Deadline: {formatDateTime(success.sla_deadline)}</p>
              </>
            ) : (
              <p className="text-amber-300">Routing pending manual review</p>
            )}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              className="rounded-xl bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a]"
              onClick={() => navigate(`/complaints/track/${success.complaint_id}`)}
            >
              Track your complaint
            </button>
            <button className="rounded-xl bg-[#334155] px-4 py-3 font-bold text-[#f1f5f9]" onClick={reset}>
              Report another issue
            </button>
            <button className="rounded-xl bg-[#334155] px-4 py-3 font-bold text-[#f1f5f9]" onClick={() => navigate('/')}>
              Back to Map
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#0f172a] px-4 py-8">
      <section className="mx-auto max-w-3xl rounded-xl bg-[#1e293b] p-5 shadow-2xl">
        <StepIndicator step={step} />
        <h1 className="mb-2 text-2xl font-bold text-[#f1f5f9]">Report a Road Issue</h1>
        <p className="mb-6 text-sm text-[#94a3b8]">Submit a civic road issue with location, description, and optional photo evidence.</p>
        {error ? <p className="mb-4 rounded-xl bg-red-950 p-3 text-sm text-red-100">{error}</p> : null}

        {step === 1 ? (
          <div className="space-y-5">
            {form.road_id ? (
              <div className="rounded-xl bg-[#334155] p-4">
                <label className="text-sm font-semibold text-[#94a3b8]">Reporting for</label>
                <p className="mt-2 font-bold text-[#f1f5f9]">{form.road_name}</p>
              </div>
            ) : (
              <div className="relative">
                <label className="mb-2 block text-sm font-semibold text-[#94a3b8]" htmlFor="road-search">
                  Search road
                </label>
                <input
                  id="road-search"
                  className="h-12 w-full rounded-xl border border-slate-600 bg-[#0f172a] px-4 text-[#f1f5f9] outline-none focus:border-[#38bdf8]"
                  value={roadQuery}
                  onChange={(event) => setRoadQuery(event.target.value)}
                  placeholder="Search Anna Salai, OMR, GST Road..."
                />
                {roadResults.length ? (
                  <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl bg-[#334155] shadow-xl">
                    {roadResults.map((road) => (
                      <button key={road.road_id} className="block w-full px-4 py-3 text-left text-sm text-[#f1f5f9] hover:bg-slate-600" onClick={() => chooseRoad(road)}>
                        {road.road_name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="rounded-xl bg-[#334155] p-4">
              <p className="mb-3 text-sm font-semibold text-[#f1f5f9]">{locationMessage}</p>
              {showCoordinateInputs ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-[#94a3b8]">
                    Latitude
                    <input className="mt-2 h-11 w-full rounded-xl bg-[#0f172a] px-3 text-[#f1f5f9] outline-none" value={form.lat} onChange={(event) => updateForm('lat', event.target.value)} />
                  </label>
                  <label className="text-sm text-[#94a3b8]">
                    Longitude
                    <input className="mt-2 h-11 w-full rounded-xl bg-[#0f172a] px-3 text-[#f1f5f9] outline-none" value={form.lng} onChange={(event) => updateForm('lng', event.target.value)} />
                  </label>
                </div>
              ) : null}
              {(form.lat || form.lng) && !latValid ? <p className="mt-2 text-sm text-amber-300">Enter a valid latitude from -90 to 90.</p> : null}
              {(form.lat || form.lng) && !lngValid ? <p className="mt-2 text-sm text-amber-300">Enter a valid longitude from -180 to 180.</p> : null}
            </div>

            {!canContinueStep1 ? <p className="text-sm text-amber-300">Select a road and provide valid coordinates to continue.</p> : null}
            <button className="w-full rounded-xl bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50" disabled={!canContinueStep1} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-semibold text-[#94a3b8]">Select one or more issue types</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {issueTypes.map((issue) => {
                  const selected = form.issue_types.includes(issue.label);
                  return (
                    <button
                      key={issue.label}
                      className={`relative rounded-xl border bg-[#334155] p-4 text-left transition hover:border-[#38bdf8] ${
                        selected ? 'border-[#38bdf8] shadow-[0_0_0_2px_rgba(56,189,248,0.35)]' : 'border-transparent'
                      }`}
                      onClick={() => toggleIssue(issue.label)}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0f172a] text-sm font-bold text-[#38bdf8]">{issue.icon}</span>
                      <span className="mt-3 block font-bold text-[#f1f5f9]">{issue.label}</span>
                      {selected ? <span className="absolute right-3 top-3 rounded-full bg-[#38bdf8] px-2 py-0.5 text-xs font-bold text-[#0f172a]">Selected</span> : null}
                    </button>
                  );
                })}
              </div>
              {!form.issue_types.length ? <p className="mt-2 text-sm text-amber-300">Select at least one issue type.</p> : null}
            </div>

            <label className="block text-sm font-semibold text-[#94a3b8]">
              Description
              <textarea
                className="mt-2 min-h-36 w-full rounded-xl border border-slate-600 bg-[#0f172a] p-4 text-[#f1f5f9] outline-none focus:border-[#38bdf8]"
                value={form.description}
                maxLength={500}
                onChange={(event) => updateForm('description', event.target.value)}
                placeholder="Describe the issue, for example: Large pothole near bus stop causing vehicles to swerve"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-[#94a3b8]">Minimum {MIN_DESCRIPTION_LENGTH} characters required</span>
              <span className={descriptionCount < MIN_DESCRIPTION_LENGTH ? 'text-amber-300' : 'text-[#94a3b8]'}>
                {descriptionCount} / 500 characters
              </span>
            </div>
            {descriptionCount < MIN_DESCRIPTION_LENGTH ? (
              <p className="text-sm text-amber-300">Please enter at least {MIN_DESCRIPTION_LENGTH} characters.</p>
            ) : null}

            <div
              className="rounded-xl border border-dashed border-slate-500 bg-[#334155] p-5 text-center"
              onDrop={(event) => {
                event.preventDefault();
                choosePhoto(event.dataTransfer.files?.[0]);
              }}
              onDragOver={(event) => event.preventDefault()}
            >
              {photoPreview ? (
                <div className="space-y-3">
                  <img className="mx-auto h-40 rounded-xl object-cover" src={photoPreview} alt="Selected complaint evidence" />
                  {loading ? <p className="text-sm text-[#94a3b8]">Uploading image...</p> : null}
                  <button className="text-sm font-semibold text-red-300" onClick={removePhoto}>
                    Remove photo
                  </button>
                </div>
              ) : (
                <button className="text-sm font-semibold text-[#38bdf8]" onClick={() => fileInputRef.current?.click()}>
                  Drag and drop or click to upload a photo
                </button>
              )}
              <input ref={fileInputRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} />
            </div>
            {uploadError ? <p className="rounded-xl bg-red-950 p-3 text-sm text-red-100">{uploadError}</p> : null}

            {!canContinueStep2 ? (
              <p className="text-sm text-amber-300">
                To continue, select at least one issue type, enter a {MIN_DESCRIPTION_LENGTH}+ character description, and resolve any photo upload error.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="rounded-xl bg-[#334155] px-4 py-3 font-bold text-[#f1f5f9]" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="rounded-xl bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50" disabled={!canContinueStep2 || loading} onClick={nextFromStep2}>
                {loading ? (photo && !form.media_url ? 'Uploading image...' : 'AI is analyzing your complaint...') : 'Next'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-[#334155] p-5">
              <h2 className="mb-4 text-xl font-bold text-[#f1f5f9]">Review Complaint</h2>
              <div className="space-y-3 text-sm text-[#f1f5f9]">
                <p><span className="text-[#94a3b8]">Road:</span> {form.road_name}</p>
                <div>
                  <span className="text-[#94a3b8]">Original selections:</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedIssues.map((issue) => (
                      <span key={issue.label} className="rounded-full bg-[#0f172a] px-3 py-1 text-xs font-bold text-[#38bdf8]">
                        {issue.icon} {issue.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[#94a3b8]">AI-normalized issues:</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(classification?.normalized_issue_types || form.issue_types).map((issue) => (
                      <span key={issue} className="rounded-full bg-[#0f172a] px-3 py-1 text-xs font-bold text-[#f1f5f9]">
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#0f172a] px-3 py-1 text-xs font-bold text-[#f1f5f9]">
                    Severity: {classification?.severity || 'Medium'}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      classification?.safety_risk ? 'bg-red-500 text-white' : 'bg-[#0f172a] text-[#94a3b8]'
                    }`}
                  >
                    {classification?.safety_risk ? 'Safety Risk' : 'No Immediate Safety Risk'}
                  </span>
                  <span className="rounded-full bg-[#38bdf8] px-3 py-1 text-xs font-bold text-[#0f172a]">
                    Urgency: {classification?.urgency_score || 6}/10
                  </span>
                </div>
                <p>
                  <span className="text-[#94a3b8]">AI routing summary:</span>{' '}
                  {classification?.summary_english || form.description}
                </p>
                <p><span className="text-[#94a3b8]">Description:</span> {form.description.length > 100 ? `${form.description.slice(0, 100)}...` : form.description}</p>
                <p><span className="text-[#94a3b8]">GPS:</span> {form.lat}, {form.lng}</p>
              </div>
              {photoPreview ? <img className="mt-4 h-32 rounded-xl object-cover" src={photoPreview} alt="Complaint evidence preview" /> : null}
              <p className="mt-4 rounded-xl bg-[#0f172a] p-3 text-sm text-[#94a3b8]">Your complaint will be automatically routed to the correct authority after submission.</p>
            </div>
            <button className="text-sm font-semibold text-[#38bdf8]" onClick={() => setStep(2)}>
              Edit details
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="rounded-xl bg-[#334155] px-4 py-3 font-bold text-[#f1f5f9]" onClick={() => setStep(2)}>
                Back
              </button>
              <button className="rounded-xl bg-[#38bdf8] px-4 py-3 font-bold text-[#0f172a] disabled:opacity-50" disabled={loading} onClick={submit}>
                {loading ? 'Submitting...' : 'Submit Complaint'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default ComplaintPage;
